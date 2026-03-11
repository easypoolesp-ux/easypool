import os
import django
import uuid

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from apps.schools.models import School, Transporter, User
from apps.buses.models import Bus, Route

def seed_isolation():
    print("Starting isolation seed...")

    # --- SCHOOL 1: Oakridge ---
    school1, _ = School.objects.get_or_create(
        name="Oakridge International",
        defaults={"address": "Gachibowli, Hyderabad"}
    )
    
    # Transporter 1 for School 1
    t1_s1, _ = Transporter.objects.get_or_create(
        name="Oakridge Fleet A",
        school=school1,
        defaults={"email": "fleeta@oakridge.com"}
    )
    
    # Transporter 2 for School 1
    t2_s1, _ = Transporter.objects.get_or_create(
        name="Oakridge Fleet B",
        school=school1,
        defaults={"email": "fleetb@oakridge.com"}
    )

    # Users for School 1
    User.objects.get_or_create(
        email='admin@oakridge.edu',
        defaults={
            'full_name': 'Oakridge Admin',
            'password': 'schoolpass',
            'role': 'school_admin',
            'school': school1
        }
    )
    
    User.objects.get_or_create(
        email='manager@fleeta.com',
        defaults={
            'full_name': 'Fleet A Manager',
            'password': 'transporterpass',
            'role': 'transporter',
            'school': school1,
            'transporter': t1_s1
        }
    )

    # Buses for School 1
    Bus.objects.get_or_create(
        internal_id="OAK-101",
        school=school1,
        transporter=t1_s1,
        defaults={"plate_number": "TS09EX1234", "driver_name": "Ravi"}
    )
    Bus.objects.get_or_create(
        internal_id="OAK-201",
        school=school1,
        transporter=t2_s1,
        defaults={"plate_number": "TS09EX5678", "driver_name": "Suresh"}
    )

    # --- SCHOOL 2: Glendale ---
    school2, _ = School.objects.get_or_create(
        name="Glendale Academy",
        defaults={"address": "Sun City, Hyderabad"}
    )
    
    # Transporter 1 for School 2
    t1_s2, _ = Transporter.objects.get_or_create(
        name="Glendale Logistics",
        school=school2,
        defaults={"email": "logistics@glendale.com"}
    )

    # Users for School 2
    User.objects.get_or_create(
        email='admin@glendale.edu',
        defaults={
            'full_name': 'Glendale Admin',
            'password': 'schoolpass',
            'role': 'school_admin',
            'school': school2
        }
    )

    # Buses for School 2
    Bus.objects.get_or_create(
        internal_id="GLEN-501",
        school=school2,
        transporter=t1_s2,
        defaults={"plate_number": "TS07AZ9999", "driver_name": "Ahmed"}
    )

    print("Isolation seed completed successfully!")
    print("\nAccounts to test:")
    print("- Oakridge Admin: admin@oakridge.edu / schoolpass (Should see OAK-101, OAK-201)")
    print("- Fleet A Manager: manager@fleeta.com / transporterpass (Should see ONLY OAK-101)")
    print("- Glendale Admin: admin@glendale.edu / schoolpass (Should see ONLY GLEN-501)")

if __name__ == '__main__':
    seed_isolation()
