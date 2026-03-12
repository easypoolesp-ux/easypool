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
    u1, _ = User.objects.get_or_create(
        email='admin@oakridge.edu',
        defaults={
            'full_name': 'Oakridge Admin',
            'role': 'school_admin',
            'school': school1
        }
    )
    u1.set_password('schoolpass')
    u1.save()
    
    u2, _ = User.objects.get_or_create(
        email='manager@fleeta.com',
        defaults={
            'full_name': 'Fleet A Manager',
            'role': 'transporter',
            'school': school1,
            'transporter': t1_s1
        }
    )
    u2.set_password('transporterpass')
    u2.save()

    # Buses for School 1
    b1_s1, _ = Bus.objects.get_or_create(
        internal_id="OAK-101",
        school=school1,
        transporter=t1_s1,
        defaults={
            "plate_number": "TS09EX1234", 
            "driver_name": "Ravi",
            "gps_imei": "123456789012345"
        }
    )
    # Add Cameras for OAK-101
    from apps.buses.models import Camera
    Camera.objects.get_or_create(bus=b1_s1, name="Front Camera", defaults={"stream_slug": "front"})
    Camera.objects.get_or_create(bus=b1_s1, name="Interior", defaults={"stream_slug": "interior"})

    b2_s1, _ = Bus.objects.get_or_create(
        internal_id="OAK-201",
        school=school1,
        transporter=t2_s1,
        defaults={
            "plate_number": "TS09EX5678", 
            "driver_name": "Suresh",
            "gps_imei": "223344556677889"
        }
    )
    # Add Camera for OAK-201
    Camera.objects.get_or_create(bus=b2_s1, name="Driver Cam", defaults={"stream_slug": "driver"})

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
    u3, _ = User.objects.get_or_create(
        email='admin@glendale.edu',
        defaults={
            'full_name': 'Glendale Admin',
            'role': 'school_admin',
            'school': school2
        }
    )
    u3.set_password('schoolpass')
    u3.save()

    # Buses for School 2
    b1_s2, _ = Bus.objects.get_or_create(
        internal_id="GLEN-501",
        school=school2,
        transporter=t1_s2,
        defaults={
            "plate_number": "TS07AZ9999", 
            "driver_name": "Ahmed",
            "gps_imei": "998877665544332"
        }
    )
    # No cameras for GLEN-501 to test 0-camera case

    print("Isolation seed completed successfully!")
    print("\nAccounts to test:")
    print("- Oakridge Admin: admin@oakridge.edu / schoolpass (Should see OAK-101, OAK-201)")
    print("- Fleet A Manager: manager@fleeta.com / transporterpass (Should see ONLY OAK-101)")
    print("- Glendale Admin: admin@glendale.edu / schoolpass (Should see ONLY GLEN-501)")

if __name__ == '__main__':
    seed_isolation()
