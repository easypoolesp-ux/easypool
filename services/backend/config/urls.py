from django.contrib import admin
from django.urls import include, path
from django.views.generic import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter

from apps.buses.views import BusViewSet, RouteViewSet
from apps.gps.views import AlertViewSet, GPSPointViewSet
from apps.schools.views import OrganisationViewSet, TransporterViewSet, UserViewSet

router = DefaultRouter(trailing_slash=False)
router.register('organisations', OrganisationViewSet, basename='organisation')
router.register('schools', OrganisationViewSet, basename='school') # Compatibility bridge
router.register('users', UserViewSet, basename='user')
router.register('transporters', TransporterViewSet, basename='transporter')
router.register('routes', RouteViewSet, basename='route')
router.register('buses', BusViewSet, basename='bus')
router.register('gps', GPSPointViewSet, basename='gps')
router.register('alerts', AlertViewSet, basename='alert')

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', RedirectView.as_view(url='/api/docs/', permanent=False), name='index'),
    # Unified API Endpoints
    path('api/', include(router.urls)),
    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]
