from rest_framework import serializers
from .models import Student, Parent
from apps.buses.serializers import BusListSerializer

class StudentListSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = ('id', 'full_name', 'student_number', 'grade', 'photo_url', 'bus', 'is_active')

class StudentDetailSerializer(serializers.ModelSerializer):
    bus = BusListSerializer(read_only=True)
    
    class Meta:
        model = Student
        exclude = ('face_embedding',) # Never send embedding to frontend

class ParentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Parent
        exclude = ('fcm_token',)
