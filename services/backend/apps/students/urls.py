from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StudentViewSet, ParentViewSet

router = DefaultRouter()
router.register('students', StudentViewSet)
router.register('parents', ParentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
