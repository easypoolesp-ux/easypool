from rest_framework import serializers

from apps.students.serializers import StudentListSerializer

from .models import Attendance


class AttendanceSerializer(serializers.ModelSerializer):
    student = StudentListSerializer(read_only=True)

    class Meta:
        model = Attendance
        fields = '__all__'
