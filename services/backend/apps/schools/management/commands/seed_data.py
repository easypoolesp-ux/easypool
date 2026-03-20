from django.core.management.base import BaseCommand

from apps.buses.models import Bus, Route
from apps.schools.models import School, Transporter


class Command(BaseCommand):
    help = 'Seeds the database with initial enterprise-grade data'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding data...')

        # 1. Create Schools
        s1, _ = School.objects.get_or_create(
            name='Kolkata International School',
            defaults={
                'address': 'Salt Lake, Sector V, Kolkata',
                'contact_email': 'contact@kis.edu.in',
                'phone': '+91 33 2345 6789',
            },
        )
        s2, _ = School.objects.get_or_create(
            name='Modern High School for Girls',
            defaults={
                'address': 'Syed Amir Ali Ave, Ballygunge, Kolkata',
                'contact_email': 'info@mhs.ac.in',
                'phone': '+91 33 2287 5326',
            },
        )

        # 2. Create Transporters
        t1, _ = Transporter.objects.get_or_create(
            school=s1,
            name='Kalyan Travels',
            defaults={
                'contact_person': 'Mr. Kalyan Das',
                'phone': '+91 98300 12345',
                'email': 'kalyan@das-travels.com',
            },
        )
        t2, _ = Transporter.objects.get_or_create(
            school=s2,
            name='City Bus Services',
            defaults={
                'contact_person': 'Mrs. Priya Sen',
                'phone': '+91 98300 54321',
                'email': 'priya@citybus.in',
            },
        )

        # 3. Create Routes
        r1, _ = Route.objects.get_or_create(
            school=s1,
            transporter=t1,
            name='Route 101 - Salt Lake Loop',
            defaults={'type': 'morning'},
        )
        r2, _ = Route.objects.get_or_create(
            school=s2,
            transporter=t2,
            name='Route 202 - Ballygunge Express',
            defaults={'type': 'afternoon'},
        )

        # 4. Create Buses
        Bus.objects.get_or_create(
            school=s1,
            transporter=t1,
            route=r1,
            internal_id='KIS-101',
            defaults={
                'plate_number': 'WB01AB1234',
                'status': 'online',
                'driver_name': 'Ramesh Kumar',
                'driver_phone': '9876543210',
            },
        )
        Bus.objects.get_or_create(
            school=s1,
            transporter=t1,
            route=r1,
            internal_id='KIS-102',
            defaults={
                'plate_number': 'WB01CD5678',
                'status': 'offline',
                'driver_name': 'Suresh Singh',
                'driver_phone': '9876543211',
            },
        )
        Bus.objects.get_or_create(
            school=s2,
            transporter=t2,
            route=r2,
            internal_id='MHS-201',
            defaults={
                'plate_number': 'WB01EF9012',
                'status': 'online',
                'driver_name': 'Amit Paul',
                'driver_phone': '9876543220',
            },
        )

        self.stdout.write(self.style.SUCCESS('Successfully seeded enterprise data!'))
