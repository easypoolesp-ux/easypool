from django.core.management.base import BaseCommand
from apps.buses.models import Bus, Route
from apps.schools.models import Organisation

class Command(BaseCommand):
    help = 'Seeds the database with initial enterprise-grade data'

    def handle(self, *args, **kwargs):
        self.stdout.write('Seeding data...')

        # 1. Create Root Organisations
        o1, _ = Organisation.objects.get_or_create(
            name='Kolkata International School',
            defaults={
                'org_type': 'school',
                'address': 'Salt Lake, Sector V, Kolkata',
                'contact_email': 'contact@kis.edu.in',
            },
        )
        o2, _ = Organisation.objects.get_or_create(
            name='Modern High School for Girls',
            defaults={
                'org_type': 'school',
                'address': 'Syed Amir Ali Ave, Ballygunge, Kolkata',
            },
        )

        # 2. Create Bus Agencies (Transporters)
        t1, _ = Organisation.objects.get_or_create(
            name='Kalyan Travels',
            defaults={
                'org_type': 'bus_agency',
                'parent': o1,
                'contact_email': 'kalyan@das-travels.com',
            },
        )

        # 3. Create Routes
        r1, _ = Route.objects.get_or_create(
            organisation=o1,
            transporter=t1,
            name='Route 101 - Salt Lake Loop',
            defaults={'type': 'morning'},
        )

        # 4. Create Buses
        Bus.objects.get_or_create(
            organisation=o1,
            transporter=t1,
            route=r1,
            internal_id='KIS-101',
            defaults={
                'plate_number': 'WB01AB1234',
                'status': 'online',
                'driver_name': 'Ramesh Kumar',
            },
        )

        self.stdout.write(self.style.SUCCESS('Successfully seeded enterprise data!'))
