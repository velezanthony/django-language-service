"""Auto-generated models for app `fleet` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models

class VehicleType(models.Model):
    """Auto-generated fleet.VehicleType for diagram stress testing."""
    name = models.CharField(max_length=200)
    capacity = models.IntegerField(default=0)

    def __str__(self):
        return str(self.name)

class Vehicle(models.Model):
    """Auto-generated fleet.Vehicle for diagram stress testing."""
    plate = models.CharField(max_length=200)
    vin = models.CharField(max_length=200)
    year = models.IntegerField(default=0)
    vehicle_type = models.ForeignKey(VehicleType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    owner = models.ForeignKey('hr.Employee', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.plate)

class Driver(models.Model):
    """Auto-generated fleet.Driver for diagram stress testing."""
    license_number = models.CharField(max_length=200)
    expires_on = models.DateField(null=True, blank=True)
    employee = models.OneToOneField('hr.Employee', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.license_number)

class DriverLicense(models.Model):
    """Auto-generated fleet.DriverLicense for diagram stress testing."""
    category = models.CharField(max_length=200)
    issued_on = models.DateField(null=True, blank=True)
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.category)

class Route(models.Model):
    """Auto-generated fleet.Route for diagram stress testing."""
    name = models.CharField(max_length=200)
    distance_km = models.FloatField(default=0.0)

    def __str__(self):
        return str(self.name)

class RouteStop(models.Model):
    """Auto-generated fleet.RouteStop for diagram stress testing."""
    name = models.CharField(max_length=200)
    sequence = models.IntegerField(default=0)
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Trip(models.Model):
    """Auto-generated fleet.Trip for diagram stress testing."""
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(auto_now_add=True)
    distance_km = models.FloatField(default=0.0)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    driver = models.ForeignKey(Driver, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    route = models.ForeignKey(Route, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.started_at)

class TripLog(models.Model):
    """Auto-generated fleet.TripLog for diagram stress testing."""
    logged_at = models.DateTimeField(auto_now_add=True)
    location = models.CharField(max_length=200)
    trip = models.ForeignKey(Trip, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.logged_at)

class FuelCard(models.Model):
    """Auto-generated fleet.FuelCard for diagram stress testing."""
    number = models.CharField(max_length=200)
    issued_on = models.DateField(null=True, blank=True)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.number)

class FuelTransaction(models.Model):
    """Auto-generated fleet.FuelTransaction for diagram stress testing."""
    liters = models.FloatField(default=0.0)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    when = models.DateTimeField(auto_now_add=True)
    card = models.ForeignKey(FuelCard, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.liters)

class MaintenanceSchedule(models.Model):
    """Auto-generated fleet.MaintenanceSchedule for diagram stress testing."""
    name = models.CharField(max_length=200)
    interval_km = models.IntegerField(default=0)
    vehicle_type = models.ForeignKey(VehicleType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class MaintenanceLog(models.Model):
    """Auto-generated fleet.MaintenanceLog for diagram stress testing."""
    performed_at = models.DateField(null=True, blank=True)
    cost = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    schedule = models.ForeignKey(MaintenanceSchedule, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.performed_at)

class InsurancePolicy(models.Model):
    """Auto-generated fleet.InsurancePolicy for diagram stress testing."""
    policy_number = models.CharField(max_length=200)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.policy_number)

class InsuranceClaim(models.Model):
    """Auto-generated fleet.InsuranceClaim for diagram stress testing."""
    claim_number = models.CharField(max_length=200)
    filed_on = models.DateField(null=True, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    policy = models.ForeignKey(InsurancePolicy, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.claim_number)

class GPSDevice(models.Model):
    """Auto-generated fleet.GPSDevice for diagram stress testing."""
    imei = models.CharField(max_length=200)
    vehicle = models.OneToOneField(Vehicle, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.imei)

class GPSRecord(models.Model):
    """Auto-generated fleet.GPSRecord for diagram stress testing."""
    latitude = models.FloatField(default=0.0)
    longitude = models.FloatField(default=0.0)
    recorded_at = models.DateTimeField(auto_now_add=True)
    device = models.ForeignKey(GPSDevice, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.latitude)

class TollTransaction(models.Model):
    """Auto-generated fleet.TollTransaction for diagram stress testing."""
    amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    occurred_at = models.DateTimeField(auto_now_add=True)
    location = models.CharField(max_length=200)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.amount)

class VehicleInspection(models.Model):
    """Auto-generated fleet.VehicleInspection for diagram stress testing."""
    inspected_at = models.DateTimeField(auto_now_add=True)
    passed = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    vehicle = models.ForeignKey(Vehicle, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    inspector = models.ForeignKey('hr.Employee', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.inspected_at)

class InspectionChecklist(models.Model):
    """Auto-generated fleet.InspectionChecklist for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class InspectionItem(models.Model):
    """Auto-generated fleet.InspectionItem for diagram stress testing."""
    label = models.CharField(max_length=200)
    is_passed = models.BooleanField(default=False)
    inspection = models.ForeignKey(VehicleInspection, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    checklist = models.ForeignKey(InspectionChecklist, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.label)
