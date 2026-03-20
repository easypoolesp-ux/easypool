import os

import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.schools.models import School, Transporter, User


def seed():
    # 1. Create a School
    school, created = School.objects.get_or_create(
        name='Oakridge International School',
        defaults={
            'address': 'Gachibowli, Hyderabad',
            'contact_email': 'admin@oakridge.edu',
            'phone': '+91 99999 99999',
        },
    )
    print(f'School: {school.name} ({"Created" if created else "Exists"})')

    # 2. Create a Transporter
    transporter, created = Transporter.objects.get_or_create(
        name='Reliable Fleet Services',
        school=school,
        defaults={
            'contact_person': 'John Doe',
            'phone': '+91 88888 88888',
            'email': 'fleet@reliable.com',
        },
    )
    print(f'Transporter: {transporter.name} ({"Created" if created else "Exists"})')

    # 3. Create Users
    # School Admin
    if not User.objects.filter(email='school@easypool.com').exists():
        User.objects.create_user(
            email='school@easypool.com',
            full_name='Oakridge Administrator',
            password='schoolpass',
            role='school_admin',
            school=school,
        )
        print('Created School User: school@easypool.com / schoolpass')

    # Transporter Admin
    if not User.objects.filter(email='transporter@easypool.com').exists():
        User.objects.create_user(
            email='transporter@easypool.com',
            full_name='Fleet Manager',
            password='transporterpass',
            role='transporter',
            school=school,
            transporter=transporter,
        )
        print('Created Transporter User: transporter@easypool.com / transporterpass')


if __name__ == '__main__':
    seed()
