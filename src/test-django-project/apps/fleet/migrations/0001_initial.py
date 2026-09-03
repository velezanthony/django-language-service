"""Auto-generated initial migration for `fleet`."""
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
        ('hr', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='VehicleType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('capacity', models.IntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='Vehicle',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plate', models.CharField(max_length=200)),
                ('vin', models.CharField(max_length=200)),
                ('year', models.IntegerField(default=0)),
                ('vehicle_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicletype')),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
            ],
        ),
        migrations.CreateModel(
            name='Driver',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('license_number', models.CharField(max_length=200)),
                ('expires_on', models.DateField(null=True, blank=True)),
                ('employee', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
            ],
        ),
        migrations.CreateModel(
            name='DriverLicense',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(max_length=200)),
                ('issued_on', models.DateField(null=True, blank=True)),
                ('driver', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.driver')),
            ],
        ),
        migrations.CreateModel(
            name='Route',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('distance_km', models.FloatField(default=0.0)),
            ],
        ),
        migrations.CreateModel(
            name='RouteStop',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('sequence', models.IntegerField(default=0)),
                ('route', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.route')),
            ],
        ),
        migrations.CreateModel(
            name='Trip',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('ended_at', models.DateTimeField(auto_now_add=True)),
                ('distance_km', models.FloatField(default=0.0)),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicle')),
                ('driver', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.driver')),
                ('route', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.route')),
            ],
        ),
        migrations.CreateModel(
            name='TripLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('logged_at', models.DateTimeField(auto_now_add=True)),
                ('location', models.CharField(max_length=200)),
                ('trip', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.trip')),
            ],
        ),
        migrations.CreateModel(
            name='FuelCard',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.CharField(max_length=200)),
                ('issued_on', models.DateField(null=True, blank=True)),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicle')),
            ],
        ),
        migrations.CreateModel(
            name='FuelTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('liters', models.FloatField(default=0.0)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('when', models.DateTimeField(auto_now_add=True)),
                ('card', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.fuelcard')),
            ],
        ),
        migrations.CreateModel(
            name='MaintenanceSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('interval_km', models.IntegerField(default=0)),
                ('vehicle_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicletype')),
            ],
        ),
        migrations.CreateModel(
            name='MaintenanceLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('performed_at', models.DateField(null=True, blank=True)),
                ('cost', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('notes', models.TextField(blank=True)),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicle')),
                ('schedule', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.maintenanceschedule')),
            ],
        ),
        migrations.CreateModel(
            name='InsurancePolicy',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('policy_number', models.CharField(max_length=200)),
                ('starts_on', models.DateField(null=True, blank=True)),
                ('ends_on', models.DateField(null=True, blank=True)),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicle')),
            ],
        ),
        migrations.CreateModel(
            name='InsuranceClaim',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('claim_number', models.CharField(max_length=200)),
                ('filed_on', models.DateField(null=True, blank=True)),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('policy', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.insurancepolicy')),
            ],
        ),
        migrations.CreateModel(
            name='GPSDevice',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('imei', models.CharField(max_length=200)),
                ('vehicle', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicle')),
            ],
        ),
        migrations.CreateModel(
            name='GPSRecord',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('latitude', models.FloatField(default=0.0)),
                ('longitude', models.FloatField(default=0.0)),
                ('recorded_at', models.DateTimeField(auto_now_add=True)),
                ('device', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.gpsdevice')),
            ],
        ),
        migrations.CreateModel(
            name='TollTransaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('amount', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('occurred_at', models.DateTimeField(auto_now_add=True)),
                ('location', models.CharField(max_length=200)),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicle')),
            ],
        ),
        migrations.CreateModel(
            name='VehicleInspection',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('inspected_at', models.DateTimeField(auto_now_add=True)),
                ('passed', models.BooleanField(default=False)),
                ('notes', models.TextField(blank=True)),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicle')),
                ('inspector', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
            ],
        ),
        migrations.CreateModel(
            name='InspectionChecklist',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='InspectionItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=200)),
                ('is_passed', models.BooleanField(default=False)),
                ('inspection', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.vehicleinspection')),
                ('checklist', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='fleet.inspectionchecklist')),
            ],
        ),
    ]
