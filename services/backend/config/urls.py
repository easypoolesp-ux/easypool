from django.contrib import admin
from django.urls import path, include
from django.views.generic import RedirectView
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from rest_framework.routers import DefaultRouter
from apps.schools.views import SchoolViewSet, UserViewSet, TransporterViewSet
from apps.buses.views import RouteViewSet, BusViewSet
from apps.gps.views import GPSPointViewSet, AlertViewSet

router = DefaultRouter(trailing_slash=False)
router.register('schools', SchoolViewSet, basename='school')
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

    # Auth Endpoints — registered both with and without trailing slash
    # because Next.js proxy strips trailing slashes before forwarding
    path('api/auth/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/auth/token', TokenObtainPairView.as_view(), name='token_obtain_pair_noslash'),
    path('api/auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/token/refresh', TokenRefreshView.as_view(), name='token_refresh_noslash'),

    # Legacy redirects — old browser-cached JS may call these old paths
    path('buses/', RedirectView.as_view(url='/api/buses', permanent=True)),
    path('buses/<path:rest>', RedirectView.as_view(url='/api/buses', permanent=True)),
    path('gps/', RedirectView.as_view(url='/api/gps', permanent=True)),
    path('gps/<path:rest>', RedirectView.as_view(url='/api/gps', permanent=True)),

    # API Documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]
