"""Auto-generated initial migration for `hr`."""
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
    ]

    operations = [
        migrations.CreateModel(
            name='Department',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('cost_center', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='Team',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.department')),
            ],
        ),
        migrations.CreateModel(
            name='Position',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('level', models.IntegerField(default=0)),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.department')),
            ],
        ),
        migrations.CreateModel(
            name='Employee',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('first_name', models.CharField(max_length=200)),
                ('last_name', models.CharField(max_length=200)),
                ('email', models.EmailField(max_length=254)),
                ('hired_on', models.DateField(null=True, blank=True)),
                ('user', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('department', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.department')),
                ('team', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.team')),
                ('position', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.position')),
                ('manager', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
            ],
        ),
        migrations.CreateModel(
            name='ContractType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='Contract',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('starts_on', models.DateField(null=True, blank=True)),
                ('ends_on', models.DateField(null=True, blank=True)),
                ('salary', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('contract_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.contracttype')),
            ],
        ),
        migrations.CreateModel(
            name='LeaveType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('paid', models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name='LeaveRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('starts_on', models.DateField(null=True, blank=True)),
                ('ends_on', models.DateField(null=True, blank=True)),
                ('status', models.CharField(max_length=200)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('leave_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.leavetype')),
            ],
        ),
        migrations.CreateModel(
            name='LeaveBalance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('days', models.FloatField(default=0.0)),
                ('year', models.IntegerField(default=0)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('leave_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.leavetype')),
            ],
        ),
        migrations.CreateModel(
            name='Benefit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='EmployeeBenefit',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('enrolled_on', models.DateField(null=True, blank=True)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('benefit', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.benefit')),
            ],
        ),
        migrations.CreateModel(
            name='PayrollRun',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period_start', models.DateField(null=True, blank=True)),
                ('period_end', models.DateField(null=True, blank=True)),
                ('run_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='Payslip',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('gross', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('net', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('run', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.payrollrun')),
            ],
        ),
        migrations.CreateModel(
            name='PerformanceReview',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('period', models.CharField(max_length=200)),
                ('overall_rating', models.FloatField(default=0.0)),
                ('notes', models.TextField(blank=True)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('reviewer', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
            ],
        ),
        migrations.CreateModel(
            name='Goal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('due_on', models.DateField(null=True, blank=True)),
                ('progress', models.FloatField(default=0.0)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('review', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.performancereview')),
            ],
        ),
        migrations.CreateModel(
            name='Skill',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='EmployeeSkill',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('proficiency', models.IntegerField(default=0)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
                ('skill', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.skill')),
            ],
        ),
        migrations.CreateModel(
            name='Attendance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('date', models.DateField(null=True, blank=True)),
                ('clock_in', models.DateTimeField(auto_now_add=True)),
                ('clock_out', models.DateTimeField(auto_now_add=True)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
            ],
        ),
        migrations.CreateModel(
            name='Holiday',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('date', models.DateField(null=True, blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='WorkSchedule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('hours_per_week', models.FloatField(default=0.0)),
                ('employee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='hr.employee')),
            ],
        ),
    ]
