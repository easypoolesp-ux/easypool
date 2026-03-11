import uuid
from django.db import models
from apps.schools.models import School, User
from apps.buses.models import Bus
from pgvector.django import VectorField

class Student(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    school = models.ForeignKey(School, on_delete=models.CASCADE, related_name='students')
    bus = models.ForeignKey(Bus, null=True, blank=True, on_delete=models.SET_NULL, related_name='students')
    full_name = models.CharField(max_length=200)
    student_number = models.CharField(max_length=50, blank=True)
    grade = models.CharField(max_length=20, blank=True)
    photo_url = models.URLField(blank=True)
    
    # pgvector field for face recognition (512-dim embedding)
    face_embedding = VectorField(dimensions=512, null=True, blank=True)
    
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.full_name

class Parent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='parent_profile')
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='parents')
    fcm_token = models.TextField(blank=True)
    notify_board = models.BooleanField(default=True)
    notify_alight = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.full_name} -> {self.student.full_name}"
