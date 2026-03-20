from rest_framework import permissions


# ── Core Permission Classes ────────────────────────────────────────────────────
#
# These use Django's built-in Group system for RBAC.
# Groups are managed in Django Admin — no code deploy needed to change a user's role.
#
# Standard Groups (create these once in Django Admin):
#   SuperAdmin   → full access across all schools/organisations
#   SchoolAdmin  → scoped to their own school's data
#   Transporter  → scoped to their own transporter's buses/routes
#   Parent       → read-only access to their child's route (future)
#
# Usage on any ViewSet:
#   permission_classes = [IsSuperAdmin | IsSchoolAdmin]


def _in_group(user, *group_names):
    """Returns True if the user is in any of the named Django Groups, or is a superuser."""
    if not user or not user.is_authenticated or not user.is_active:
        return False
    if user.is_superuser:
        return True
    return user.groups.filter(name__in=group_names).exists()


class IsSuperAdmin(permissions.BasePermission):
    """Full access. Only members of the 'SuperAdmin' Django Group."""
    message = "This action requires Super Admin access. Please contact your administrator."

    def has_permission(self, request, view):
        return _in_group(request.user, 'SuperAdmin')


class IsSchoolAdmin(permissions.BasePermission):
    """Access scoped to the user's own school. Members of 'SchoolAdmin' Group."""
    message = "This action requires School Admin access. Please contact your administrator."

    def has_permission(self, request, view):
        return _in_group(request.user, 'SuperAdmin', 'SchoolAdmin')


class IsTransporter(permissions.BasePermission):
    """Access scoped to the user's own transporter. Members of 'Transporter' Group."""
    message = "This action requires Transporter access. Please contact your administrator."

    def has_permission(self, request, view):
        return _in_group(request.user, 'SuperAdmin', 'SchoolAdmin', 'Transporter')


class IsParent(permissions.BasePermission):
    """Read-only access for parents. Members of 'Parent' Group."""
    message = "This action requires Parent access. Please contact your administrator."

    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return _in_group(request.user, 'SuperAdmin', 'SchoolAdmin', 'Transporter', 'Parent')
        return False


# ── School / Transporter Data Isolation Mixin ─────────────────────────────────
#
# Automatically filters querysets so users only see data belonging to their
# school or transporter. SuperAdmins see everything.
#
# SECURITY: Unauthenticated requests are NEVER allowed through — they return
# an empty queryset rather than leaking data, so the view's permission_classes
# will issue a 403 before the data is even fetched.

class SchoolIsolationMixin:
    """
    Filters querysets by the user's organisation (or legacy school/transporter).
    Works for all organisation types: school, bus_agency, carpool, corporate.

    - SuperAdmin (group) / superuser : sees all data across all organisations
    - SchoolAdmin / CarpoolAdmin     : sees only their organisation's data
    - Transporter                    : sees only their transporter's data within the org
    - Unauthenticated / no role      : sees nothing — safety net before permission_classes
    """
    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()

        # Safety net: unauthenticated requests must be blocked by permission_classes.
        # Return nothing here rather than leak any data.
        if not user.is_authenticated or not user.is_active:
            return queryset.none()

        # SuperAdmins see everything across all tenants
        if user.is_superuser or user.groups.filter(name='SuperAdmin').exists():
            return queryset

        model = queryset.model
        filters = {}

        # Transporter-level isolation (most specific)
        if user.groups.filter(name='Transporter').exists():
            if hasattr(user, 'transporter') and user.transporter and hasattr(model, 'transporter'):
                filters['transporter'] = user.transporter

        # Organisation-level isolation (new multi-tenant field)
        if hasattr(user, 'organisation') and user.organisation:
            user_orgs = user.organisation.get_descendants()
            user_orgs.append(user.organisation)

            from django.db.models import Q

            if hasattr(model, 'organisation') and hasattr(model, 'allocated_to'):
                # For models like Bus that use the "Google Drive" style Read/Write model
                # User sees assets they physically OWN or assets ALLOCATED to them as guests
                filters = Q(organisation__in=user_orgs) | Q(allocated_to__in=user_orgs)
                queryset = queryset.filter(filters).distinct()
            elif hasattr(model, 'organisation'):
                # For models that only have physical ownership
                queryset = queryset.filter(organisation__in=user_orgs)
            
        # Fallback: legacy school FK for backwards compatibility
        elif hasattr(user, 'school') and user.school and hasattr(model, 'school'):
            queryset = queryset.filter(school=user.school)

        return queryset
