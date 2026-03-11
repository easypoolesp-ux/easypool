from rest_framework import serializers
from .models import Attendance
from apps.students.serializers import StudentListSerializer

class AttendanceSerializer(serializers.ModelSerializer):
    student = StudentListSerializer(read_only=True)
    
    class Meta:
        model = Attendance
        fields = '__all__'
