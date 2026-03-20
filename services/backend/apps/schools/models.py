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


# ── Transporter ────────────────────────────────────────────────────────────────
class Transporter(models.Model):
    """
    A transport operator (company or individual) that operates vehicles
    under an organisation.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.CASCADE, related_name='transporters'
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
    Belongs to an Organisation.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=200)
    firebase_uid = models.CharField(max_length=200, blank=True, db_index=True)
    google_id = models.CharField(max_length=200, blank=True)
    photo_url = models.URLField(blank=True)

    # Primary association: Organisation (works for all business types)
    organisation = models.ForeignKey(
        Organisation, null=True, blank=True, on_delete=models.SET_NULL, related_name='users'
    )
    transporter = models.ForeignKey(
        Transporter, null=True, blank=True, on_delete=models.SET_NULL, related_name='users'
    )

    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    def __str__(self):
        return self.email
