# Django Backend — AI Build Prompt
# Use each section as a separate prompt in order
# Complete each step fully before moving to next

---

## MASTER CONTEXT
### Paste this at start of EVERY conversation

```
You are building a Django REST Framework backend for a 
school bus tracking system. Follow these rules strictly:

RULES:
1. Use Django REST Framework (DRF) for all APIs
2. Use UUID primary keys for all main tables
3. Use BIGSERIAL for high-volume tables (gps_points, attendance)
4. Every view must filter by school_id from request.user
   (school admin never sees another school's data)
5. Use ModelViewSet for all CRUD operations
6. Use SimpleJWT for authentication (added later)
7. Every serializer must have explicit fields list (no fields = '__all__')
8. Every model must have __str__ method
9. Every model must have created_at = auto timestamp
10. Use python-decouple for all environment variables

TECH:
- Django 4.2
- djangorestframework 3.14
- psycopg2-binary (PostgreSQL)
- python-decouple (env vars)

PROJECT STRUCTURE:
app-backend/
├── config/
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── apps/
│   ├── schools/
│   ├── buses/
│   ├── students/
│   ├── gps/
│   ├── attendance/
│   └── recordings/
├── core/
│   ├── permissions.py
│   └── utils.py
├── manage.py
├── requirements.txt
└── Dockerfile
```

---

## PROMPT 1 — Project Setup + Settings
### Run this first, nothing else

```
Following the master context above, create:

1. requirements.txt with:
django==4.2
djangorestframework==3.14
djangorestframework-simplejwt==5.3
django-cors-headers==4.3
psycopg2-binary==2.9
paho-mqtt==1.6
google-cloud-storage==2.10
firebase-admin==6.2
channels==4.0
channels-redis==4.1
gunicorn==21.2
python-decouple==3.8

2. config/settings.py with:
- Database: PostgreSQL using env vars:
  DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT
- INSTALLED_APPS includes:
  rest_framework, corsheaders, channels
  apps.schools, apps.buses, apps.students,
  apps.gps, apps.attendance, apps.recordings
- CORS: allow all origins in dev
  (CORS_ALLOW_ALL_ORIGINS = True for now)
- REST_FRAMEWORK:
  DEFAULT_AUTHENTICATION_CLASSES: JWTAuthentication
  DEFAULT_PERMISSION_CLASSES: IsAuthenticated
  DEFAULT_PAGINATION_CLASS: PageNumberPagination
  PAGE_SIZE: 20
- AUTH_USER_MODEL = 'schools.User'
- All secrets from environment variables

3. config/urls.py with:
- Include urls from all 6 apps
- All routes under /api/ prefix:
  /api/schools/
  /api/buses/
  /api/students/
  /api/gps/
  /api/attendance/
  /api/recordings/
- JWT token endpoints:
  /api/auth/token/
  /api/auth/token/refresh/

4. Dockerfile:
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application",
     "--bind", "0.0.0.0:8000",
     "--workers", "4"]

5. .env.example:
SECRET_KEY=your-secret-key-here
DEBUG=True
DB_NAME=bustrack
DB_USER=busadmin
DB_PASSWORD=your-password
DB_HOST=cloud-sql-proxy
DB_PORT=5432
REDIS_URL=redis://redis:6379
GCS_BUCKET=your-bucket-name
```

---

## PROMPT 2 — Schools App + Custom User Model
### Schools first because everything else references it

```
Following master context, create the schools app with:

FILE: apps/schools/models.py

1. School model:
   id           = UUIDField(primary_key=True, default=uuid4)
   name         = CharField(max_length=200)
   address      = TextField(blank=True)
   contact_email= EmailField(blank=True)
   phone        = CharField(max_length=20, blank=True)
   is_active    = BooleanField(default=True)
   created_at   = DateTimeField(auto_now_add=True)
   updated_at   = DateTimeField(auto_now=True)
   __str__: return school name

2. User model (extends AbstractBaseUser):
   id           = UUIDField(primary_key=True, default=uuid4)
   email        = EmailField(unique=True)
   full_name    = CharField(max_length=200)
   google_id    = CharField(max_length=200, blank=True)
   photo_url    = URLField(blank=True)
   role         = CharField choices:
                  ('superadmin', 'Super Admin')
                  ('transporter', 'Transporter')
                  ('school_admin', 'School Admin')
                  ('parent', 'Parent')
   school       = ForeignKey(School, null=True, blank=True,
                  on_delete=SET_NULL)
   is_active    = BooleanField(default=True)
   is_staff     = BooleanField(default=False)
   created_at   = DateTimeField(auto_now_add=True)
   USERNAME_FIELD = 'email'
   REQUIRED_FIELDS = ['full_name']
   __str__: return email

FILE: apps/schools/serializers.py
- SchoolSerializer: id, name, address, contact_email, phone, is_active
- UserSerializer: id, email, full_name, role, school, photo_url

FILE: apps/schools/views.py
- SchoolViewSet(ModelViewSet):
  - superadmin: sees all schools
  - school_admin: sees only their school
  - transporter: sees all schools (read only)
  
- UserViewSet(ModelViewSet):
  - superadmin: sees all users
  - school_admin: sees only users in their school

FILE: apps/schools/urls.py
- router.register('schools', SchoolViewSet)
- router.register('users', UserViewSet)

FILE: core/permissions.py
Create these permission classes:
- IsSuperAdmin: role == 'superadmin'
- IsSchoolAdmin: role == 'school_admin'
- IsTransporter: role == 'transporter'
- IsParent: role == 'parent'
- IsSchoolAdminOrSuperAdmin: either of above two
- SchoolIsolationMixin: 
  overrides get_queryset to always filter
  by request.user.school_id
  unless user is superadmin
```

---

## PROMPT 3 — Buses App
### After schools app is working

```
Following master context, create the buses app:

FILE: apps/buses/models.py

1. Route model:
   id           = UUIDField primary key
   school       = ForeignKey(School)
   name         = CharField(max_length=200) e.g. "Morning Route A"
   type         = CharField choices:
                  ('morning', 'Morning')
                  ('afternoon', 'Afternoon')
                  ('custom', 'Custom')
   is_active    = BooleanField(default=True)
   created_at   = DateTimeField(auto_now_add=True)
   __str__: return name

2. Bus model:
   id           = UUIDField primary key
   school       = ForeignKey(School, on_delete=CASCADE)
   route        = ForeignKey(Route, null=True, blank=True,
                  on_delete=SET_NULL)
   internal_id  = CharField(max_length=50)  e.g. WB101
   plate_number = CharField(max_length=50)  e.g. WB01AB1234
   status       = CharField choices:
                  ('online', 'Online')
                  ('offline', 'Offline')
                  ('idle', 'Idle')
                  default='offline'
   camera_count = IntegerField(default=4)
   router_ip    = GenericIPAddressField(null=True, blank=True)
   driver_name  = CharField(max_length=200, blank=True)
   driver_phone = CharField(max_length=20, blank=True)
   created_at   = DateTimeField(auto_now_add=True)
   updated_at   = DateTimeField(auto_now=True)
   __str__: return internal_id + plate_number

FILE: apps/buses/serializers.py
- RouteSerializer: all fields
- BusListSerializer:
  id, internal_id, plate_number, status,
  school, route, driver_name
- BusDetailSerializer:
  all fields including router_ip, camera_count
  nested RouteSerializer for route field

FILE: apps/buses/views.py
- RouteViewSet(ModelViewSet):
  use SchoolIsolationMixin
  filter queryset by request.user.school
  
- BusViewSet(ModelViewSet):
  use SchoolIsolationMixin
  filter queryset by request.user.school
  list action uses BusListSerializer
  retrieve action uses BusDetailSerializer
  
  Extra actions:
  @action GET buses/online/ 
    → return only online buses for school
  @action POST buses/{id}/update_status/
    → update bus status field only

FILE: apps/buses/urls.py
- router.register('routes', RouteViewSet)
- router.register('buses', BusViewSet)
```

---

## PROMPT 4 — Students App
### After buses app is working

```
Following master context, create the students app:

FILE: apps/students/models.py

1. Student model:
   id             = UUIDField primary key
   school         = ForeignKey(School, on_delete=CASCADE)
   bus            = ForeignKey(Bus, null=True, blank=True,
                    on_delete=SET_NULL)
   full_name      = CharField(max_length=200)
   student_number = CharField(max_length=50, blank=True)
   grade          = CharField(max_length=20, blank=True)
   photo_url      = URLField(blank=True)
   face_embedding = JSONField(null=True, blank=True)
                    (store as JSON array of 512 floats)
   is_active      = BooleanField(default=True)
   created_at     = DateTimeField(auto_now_add=True)
   updated_at     = DateTimeField(auto_now=True)
   __str__: return full_name

2. Parent model:
   id             = UUIDField primary key
   user           = OneToOneField(User, on_delete=CASCADE)
   student        = ForeignKey(Student, on_delete=CASCADE)
   fcm_token      = TextField(blank=True)
   notify_board   = BooleanField(default=True)
   notify_alight  = BooleanField(default=True)
   created_at     = DateTimeField(auto_now_add=True)
   __str__: return user.full_name + student.full_name

FILE: apps/students/serializers.py
- StudentListSerializer:
  id, full_name, student_number, grade,
  photo_url, bus, is_active
  
- StudentDetailSerializer:
  all fields EXCEPT face_embedding
  (never send embedding to frontend)
  nested BusListSerializer for bus field
  
- ParentSerializer:
  id, user, student, notify_board, notify_alight
  (exclude fcm_token from response always)

FILE: apps/students/views.py
- StudentViewSet(ModelViewSet):
  use SchoolIsolationMixin
  filter by request.user.school
  list: StudentListSerializer
  retrieve: StudentDetailSerializer
  
  Extra actions:
  @action GET students/?bus={busId}
    → filter students by bus
  @action GET students/?grade={grade}
    → filter by grade
  @action POST students/{id}/upload_photo/
    → accept image file
    → upload to GCS
    → update photo_url field
    → trigger face embedding generation

- ParentViewSet(ModelViewSet):
  filter by student school only

FILE: apps/students/urls.py
- router.register('students', StudentViewSet)
- router.register('parents', ParentViewSet)
```

---

## PROMPT 5 — GPS App
### After buses app is working

```
Following master context, create the gps app:

FILE: apps/gps/models.py

1. GPSPoint model:
   id        = BigAutoField primary key  (NOT UUID - high volume)
   bus       = ForeignKey(Bus, on_delete=CASCADE)
   lat       = FloatField
   lng       = FloatField
   speed     = FloatField(default=0)
   heading   = FloatField(default=0)
   accuracy  = FloatField(null=True)
   timestamp = DateTimeField(db_index=True)
   
   class Meta:
     ordering = ['-timestamp']
     indexes = [
       Index(fields=['bus', '-timestamp'])
     ]
   __str__: return bus + timestamp

2. Alert model:
   id          = UUIDField primary key
   bus         = ForeignKey(Bus, on_delete=CASCADE)
   type        = CharField choices:
                 ('sos', 'SOS')
                 ('overspeed', 'Overspeed')
                 ('off_route', 'Off Route')
                 ('camera_offline', 'Camera Offline')
                 ('student_missing', 'Student Missing')
   message     = TextField
   is_resolved = BooleanField(default=False)
   resolved_by = ForeignKey(User, null=True, blank=True,
                 on_delete=SET_NULL)
   created_at  = DateTimeField(auto_now_add=True)
   __str__: return type + bus

FILE: apps/gps/serializers.py
- GPSPointSerializer:
  id, bus, lat, lng, speed, heading, timestamp
  
- GPSLatestSerializer:
  bus, lat, lng, speed, heading, timestamp
  (used for live map — just latest point)
  
- AlertSerializer:
  all fields, nested bus info

FILE: apps/gps/views.py
- GPSPointViewSet:
  GET gps/?bus={busId}&start={datetime}&end={datetime}
  → return GPS trail for playback
  → filter by school always
  → limit to 1000 points max per request
  
  @action GET gps/latest/
  → return latest GPS point for EVERY bus
     in school (for fleet map)
  → used by dashboard map on load
  
  @action GET gps/latest/{busId}/
  → return latest single bus location

- AlertViewSet(ModelViewSet):
  filter by school
  @action POST alerts/{id}/resolve/
  → set is_resolved=True, resolved_by=request.user

FILE: apps/gps/mqtt.py
Create MQTT listener:

import paho.mqtt.client as mqtt
import json
from django.utils import timezone

def on_connect(client, userdata, flags, rc):
    client.subscribe("bus/+/location")  # + = any bus_id

def on_message(client, userdata, msg):
    # topic = "bus/BUS001/location"
    topic_parts = msg.topic.split('/')
    bus_internal_id = topic_parts[1]
    
    payload = json.loads(msg.payload)
    
    # Find bus by internal_id
    bus = Bus.objects.get(internal_id=bus_internal_id)
    
    # Save GPS point
    GPSPoint.objects.create(
        bus=bus,
        lat=payload['lat'],
        lng=payload['lng'],
        speed=payload.get('speed', 0),
        heading=payload.get('heading', 0),
        timestamp=timezone.now()
    )
    
    # Update bus status to online
    Bus.objects.filter(id=bus.id).update(status='online')

def start_mqtt():
    client = mqtt.Client()
    client.on_connect = on_connect
    client.on_message = on_message
    client.connect(MQTT_HOST, 1883, 60)
    client.loop_forever()

FILE: apps/gps/urls.py
- router.register('gps', GPSPointViewSet)
- router.register('alerts', AlertViewSet)
```

---

## PROMPT 6 — Attendance App
### After students app is working

```
Following master context, create the attendance app:

FILE: apps/attendance/models.py

1. Attendance model:
   id          = BigAutoField primary key  (NOT UUID)
   student     = ForeignKey(Student, on_delete=CASCADE)
   bus         = ForeignKey(Bus, on_delete=CASCADE)
   direction   = CharField choices:
                 ('boarding', 'Boarding')
                 ('alighting', 'Alighting')
   confidence  = FloatField()
   clip_url    = URLField(blank=True)
   frame_url   = URLField(blank=True)
   notified    = BooleanField(default=False)
   timestamp   = DateTimeField(auto_now_add=True, db_index=True)
   
   class Meta:
     ordering = ['-timestamp']
     indexes = [
       Index(fields=['bus', '-timestamp']),
       Index(fields=['student', '-timestamp']),
     ]
   __str__: return student + direction + timestamp

FILE: apps/attendance/serializers.py
- AttendanceSerializer:
  id, student (nested: id+name+photo_url),
  bus (nested: id+internal_id),
  direction, confidence, clip_url,
  timestamp, notified

- AttendanceSummarySerializer:
  For daily summary cards:
  date, total_boarded, total_alighted,
  total_students, absent_students

FILE: apps/attendance/views.py
- AttendanceViewSet:
  filter by school always
  
  GET /api/attendance/
  Query params:
  - bus={busId}
  - date={YYYY-MM-DD}
  - student={studentId}
  - direction=boarding/alighting
  
  @action GET attendance/summary/
  Query params: bus={busId}&date={YYYY-MM-DD}
  Returns:
  {
    total_students: 40,
    boarded: 38,
    alighted: 35,
    absent: [list of absent student names]
  }
  
  @action GET attendance/export/
  Query params: bus={busId}&date={YYYY-MM-DD}
  Returns CSV file download

FILE: apps/attendance/urls.py
- router.register('attendance', AttendanceViewSet)
```

---

## PROMPT 7 — Recordings App
### After buses app is working

```
Following master context, create the recordings app:

FILE: apps/recordings/models.py

1. Recording model:
   id          = UUIDField primary key
   bus         = ForeignKey(Bus, on_delete=CASCADE)
   camera_id   = CharField(max_length=10)  e.g. cam1, cam2
   started_at  = DateTimeField()
   ended_at    = DateTimeField(null=True, blank=True)
   hls_url     = URLField(blank=True)
   storage     = CharField choices:
                 ('sd_card', 'SD Card')
                 ('gcs', 'Google Cloud Storage')
                 default='sd_card'
   file_size   = BigIntegerField(null=True)
   created_at  = DateTimeField(auto_now_add=True)
   __str__: return bus + camera_id + started_at

FILE: apps/recordings/serializers.py
- RecordingSerializer:
  id, bus, camera_id, started_at,
  ended_at, hls_url, storage, file_size

- SignedURLSerializer:
  For returning temporary GCS signed URLs
  recording_id, signed_url, expires_at

FILE: apps/recordings/views.py
- RecordingViewSet:
  filter by school always
  
  GET /api/recordings/
  Query params:
  - bus={busId}
  - camera={cam1/cam2/cam3/cam4}
  - date={YYYY-MM-DD}
  
  @action GET recordings/{id}/stream_url/
  → if storage == 'sd_card':
      return MediaMTX RTSP playback URL
      rtsp://BUS_IP:554/Streaming/tracks/101
      ?starttime={started_at}
  → if storage == 'gcs':
      generate GCS signed URL (1 hour expiry)
      return signed URL for HLS player

FILE: apps/recordings/urls.py
- router.register('recordings', RecordingViewSet)
```

---

## PROMPT 8 — Run & Test Everything

```
After all apps created, do this in order:

1. Create all migrations:
   python manage.py makemigrations schools
   python manage.py makemigrations buses
   python manage.py makemigrations students
   python manage.py makemigrations gps
   python manage.py makemigrations attendance
   python manage.py makemigrations recordings

2. Run migrations:
   python manage.py migrate

3. Create superuser:
   python manage.py createsuperuser

4. Test each endpoint with curl:

# Get JWT token
curl -X POST http://localhost:8000/api/auth/token/ \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"test"}'

# Get all buses (use token from above)
curl http://localhost:8000/api/buses/ \
  -H "Authorization: Bearer {token}"

# Get latest GPS for all buses
curl http://localhost:8000/api/gps/latest/ \
  -H "Authorization: Bearer {token}"

# Get attendance for today
curl "http://localhost:8000/api/attendance/?date=2024-01-15" \
  -H "Authorization: Bearer {token}"
```

---

## WHAT EACH API RETURNS — QUICK REFERENCE

```
GET /api/buses/
[{id, internal_id, plate_number, status, driver_name, route}]

GET /api/buses/{id}/
{all bus fields + nested route + school}

GET /api/gps/latest/
[{bus_id, lat, lng, speed, heading, timestamp}]
← one entry per bus, for live map

GET /api/gps/?bus=xxx&start=xxx&end=xxx
[{lat, lng, speed, timestamp}, ...]
← GPS trail for playback

GET /api/students/?bus=xxx
[{id, full_name, grade, photo_url, is_active}]

GET /api/attendance/?bus=xxx&date=xxx
[{student{name,photo}, direction, confidence, clip_url, timestamp}]

GET /api/attendance/summary/?bus=xxx&date=xxx
{total_students, boarded, alighted, absent:[...]}

GET /api/recordings/?bus=xxx&date=xxx
[{id, camera_id, started_at, ended_at, storage}]

GET /api/recordings/{id}/stream_url/
{url: "rtsp://..." or "https://storage.googleapis.com/..."}
```