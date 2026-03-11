from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import SchoolViewSet, UserViewSet

router = DefaultRouter()
router.register('schools', SchoolViewSet)
router.register('users', UserViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
