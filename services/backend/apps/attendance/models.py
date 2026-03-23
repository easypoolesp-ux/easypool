from django.db import models

from apps.buses.models import Bus
from apps.students.models import Student


class Attendance(models.Model):
    DIRECTION_CHOICES = (
        ('boarding', 'Boarding'),
        ('alighting', 'Alighting'),
    )

    id = models.BigAutoField(primary_key=True)
    student = models.ForeignKey(
        Student, on_delete=models.CASCADE, related_name='attendance_records'
    )
    bus = models.ForeignKey(Bus, on_delete=models.CASCADE, related_name='attendance_records')
    direction = models.CharField(max_length=20, choices=DIRECTION_CHOICES)
    confidence = models.FloatField()
    clip_url = models.URLField(blank=True)
    frame_url = models.URLField(blank=True)
    notified = models.BooleanField(default=False)
    timestamp = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['bus', '-timestamp'], name='attendance__bus_id_8e681b_idx'),
            models.Index(fields=['student', '-timestamp'], name='attendance__student_2a90dc_idx'),
        ]

    def __str__(self):
        return f'{self.student.full_name} - {self.direction} @ {self.timestamp}'
