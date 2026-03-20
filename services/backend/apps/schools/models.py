import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


# ── Organisation (Multi-Tenant, Hierarchical) ──────────────────────────────────
class Organisation(models.Model):
    """
    Top-level entity for every tenant. Supports unlimited hierarchy via
    self-referential parent FK. Works for any business vertical.

    Hierarchy examples:
      ABC Group (corporate)
        └── School Division (school)
              └── Springfield Branch (school)
      CityPool Ltd (carpool)
        └── North Zone (carpool)
    """

    ORG_TYPE_CHOICES = (
        ('school', 'School / Education'),
        ('bus_agency', 'Independent Bus Agency'),
        ('carpool', 'Carpool Agency'),
        ('corporate', 'Corporate Shuttle'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    org_type = models.CharField(max_length=20, choices=ORG_TYPE_CHOICES, default='bus_agency')
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.SET_NULL, related_name='children'
    )
    address = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.get_org_type_display()})'

    def get_ancestors(self):
        """Returns list of ancestor organisations from root to parent."""
        ancestors = []
        current = self.parent
        while current:
            ancestors.insert(0, current)
            current = current.parent
        return ancestors

    def get_descendants(self):
        """Returns all child organisations recursively."""
        result = list(self.children.all())
        for child in self.children.all():
            result.extend(child.get_descendants())
        return result


# ── School Profile (only for org_type='school') ───────────────────────────────
class School(models.Model):
    """
    Optional school-specific profile for an Organisation.
    Only created for organisations with org_type='school'.
    Contains school-specific data: students, attendance etc are linked here.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.OneToOneField(
        Organisation, null=True, blank=True, on_delete=models.CASCADE, related_name='school_profile'
    )
    # Legacy fields kept for backwards compatibility
    name = models.CharField(max_length=200, blank=True)
    address = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.organisation.name if self.organisation else f"Legacy School {self.name}"


# ── Transporter ────────────────────────────────────────────────────────────────
class Transporter(models.Model):
    """
    A transport operator (company or individual) that operates vehicles
    under an organisation. May be attached to a school or an independent
    bus agency or carpool org.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.CASCADE, related_name='transporters'
    )
    # Legacy FK kept nullable for backwards compatibility
    school = models.ForeignKey(
        School, null=True, blank=True, on_delete=models.SET_NULL, related_name='transporters'
    )
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


# ── User Manager ───────────────────────────────────────────────────────────────
class UserManager(BaseUserManager):
    def create_user(self, email, full_name, password=None, **extra_fields):
        if not email:
            raise ValueError('The Email field must be set')
        email = self.normalize_email(email)
        user = self.model(email=email, full_name=full_name, **extra_fields)
        if password:
            user.set_password(password)
        else:
            # Firebase-managed users have no Django password.
            # set_unusable_password() is Django's official sentinel for
            # externally-authenticated accounts — not a fake password.
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_portal_user(self, email, full_name, group_name, **extra_fields):
        """
        Creates a user for Firebase-based authentication.
        Assigns them to a Django Group for RBAC.
        No password stored — Firebase handles authentication entirely.
        """
        from django.contrib.auth.models import Group

        user = self.create_user(email, full_name, **extra_fields)
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, full_name, password, **extra_fields)


# ── User ───────────────────────────────────────────────────────────────────────
class User(AbstractBaseUser, PermissionsMixin):
    """
    Portal user. Authenticated via Firebase; authorised via Django Groups.
    Belongs to an Organisation (not just a School).

    Groups:
      SuperAdmin    → full access across all organisations
      SchoolAdmin   → scoped to their organisation (school type)
      Transporter   → scoped to their transporter within an organisation
      CarpoolAdmin  → scoped to their carpool organisation
      Parent        → read-only, scoped to their child's route
    """

    # Legacy role field kept for backwards compatibility during migration
    ROLE_CHOICES = (
        ('superadmin', 'Super Admin'),
        ('transporter', 'Transporter'),
        ('school_admin', 'School Admin'),
        ('parent', 'Parent'),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=200)
    firebase_uid = models.CharField(max_length=200, blank=True, db_index=True)
    # Legacy field name kept for DB compatibility
    google_id = models.CharField(max_length=200, blank=True)
    photo_url = models.URLField(blank=True)

    # Primary association: Organisation (works for all business types)
    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.SET_NULL, related_name='users'
    )
    # Legacy school FK kept nullable for backwards compatibility
    school = models.ForeignKey(
        School, null=True, blank=True, on_delete=models.SET_NULL, related_name='users'
    )
    transporter = models.ForeignKey(
        Transporter, null=True, blank=True, on_delete=models.SET_NULL, related_name='users'
    )

    # Legacy role field — RBAC is now handled by Django Groups
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='school_admin')

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    def __str__(self):
        return self.email
