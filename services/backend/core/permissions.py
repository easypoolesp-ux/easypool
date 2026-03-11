from rest_framework import permissions

class IsSuperAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'superadmin'

class IsSchoolAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'school_admin'

class IsTransporter(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'transporter'

class IsParent(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'parent'

class SchoolIsolationMixin:
    """
    Mixin to filter querysets by the user's school.
    Superadmins can see everything.
    """
    def get_queryset(self):
        user = self.request.user
        queryset = super().get_queryset()
        
        # If not authenticated, allow viewing all data (Public Dashboard Mode)
        if not user.is_authenticated:
            return queryset

        if hasattr(user, 'role') and user.role == 'superadmin':
            return queryset
        
        # Determine filtering based on user role and model structure
        model = queryset.model
        filters = {}
        
        # If user is a Transporter, prioritize transporter-level isolation
        if hasattr(user, 'role') and user.role == 'transporter' and hasattr(model, 'transporter'):
            filters['transporter'] = user.transporter
        
        # Always enforce school-level isolation if applicable
        if hasattr(user, 'role') and user.role != 'superadmin' and hasattr(model, 'school'):
            filters['school'] = user.school
            
        return queryset.filter(**filters) if filters else queryset.all()
