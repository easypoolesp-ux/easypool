import uuid
from django.db import models
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin

class School(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    address = models.TextField(blank=True)
    contact_email = models.EmailField(blank=True)
    phone = models.CharField(max_length=20, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Transporter(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='transporters')
    name = models.CharField(max_length=200)
    contact_person = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name

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
            # set_unusable_password() is Django's official way to mark
            # external-auth accounts — it is not a fake password, it is
            # a sentinel that permanently blocks direct Django login.
            user.set_unusable_password()
        user.save(using=self._db)
        return user

    def create_portal_user(self, email, full_name, group_name, **extra_fields):
        """
        Creates a user intended to authenticate via Firebase only.
        Assigns them to a Django Group for RBAC.
        No password is set — authentication is handled entirely by Firebase.

        Usage (management command or Django Admin):
            User.objects.create_portal_user(
                email='admin@school.com',
                full_name='School Admin',
                group_name='SchoolAdmin',
                school=school_instance,
            )
        """
        from django.contrib.auth.models import Group
        user = self.create_user(email, full_name, **extra_fields)
        group, _ = Group.objects.get_or_create(name=group_name)
        user.groups.add(group)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'superadmin')
        return self.create_user(email, full_name, password, **extra_fields)

class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = (
        ('superadmin', 'Super Admin'),
        ('transporter', 'Transporter'),
        ('school_admin', 'School Admin'),
        ('parent', 'Parent'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=200)
    google_id = models.CharField(max_length=200, blank=True)
    photo_url = models.URLField(blank=True)
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default='school_admin')
    school = models.ForeignKey(School, null=True, blank=True, on_delete=models.SET_NULL, related_name='users')
    transporter = models.ForeignKey(Transporter, null=True, blank=True, on_delete=models.SET_NULL, related_name='users')
    
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    def __str__(self):
        return self.email
