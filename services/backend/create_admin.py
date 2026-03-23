import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from django.contrib.auth import get_user_model

User = get_user_model()
email = 'admin@easypool.in'
full_name = 'Admin User'
password = 'Admin@2026'

print(f"Checking for superuser: {email}")
u, created = User.objects.get_or_create(
    email=email,
    defaults={'full_name': full_name, 'is_staff': True, 'is_superuser': True}
)

u.set_password(password)
u.is_staff = True
u.is_superuser = True
u.save()

if created:
    print(f"Superuser {email} created successfully.")
else:
    print(f"Superuser {email} updated successfully.")
