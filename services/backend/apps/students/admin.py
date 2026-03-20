from django.contrib import admin

from .models import Parent, Student


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ('full_name', 'student_number', 'organisation', 'grade', 'is_active')
    search_fields = ('full_name', 'student_number')
    list_filter = ('grade', 'is_active')
    raw_id_fields = ('organisation', 'bus')
    filter_horizontal = ('allocated_to',)


@admin.register(Parent)
class ParentAdmin(admin.ModelAdmin):
    list_display = ('get_full_name', 'get_email', 'organisation', 'student')
    search_fields = ('user__full_name', 'user__email')
    raw_id_fields = ('user', 'student', 'organisation')

    def get_full_name(self, obj):
        return obj.user.full_name

    get_full_name.short_description = 'Parent Name'

    def get_email(self, obj):
        return obj.user.email

    get_email.short_description = 'Email'
