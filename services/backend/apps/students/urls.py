from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ParentViewSet, StudentViewSet

router = DefaultRouter()
router.register('students', StudentViewSet)
router.register('parents', ParentViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
