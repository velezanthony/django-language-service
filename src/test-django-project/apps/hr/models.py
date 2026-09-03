"""Auto-generated models for app `hr` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models

class Department(models.Model):
    """Auto-generated hr.Department for diagram stress testing."""
    name = models.CharField(max_length=200)
    cost_center = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class Team(models.Model):
    """Auto-generated hr.Team for diagram stress testing."""
    name = models.CharField(max_length=200)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Position(models.Model):
    """Auto-generated hr.Position for diagram stress testing."""
    title = models.CharField(max_length=200)
    level = models.IntegerField(default=0)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class Employee(models.Model):
    """Auto-generated hr.Employee for diagram stress testing."""
    first_name = models.CharField(max_length=200)
    last_name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254)
    hired_on = models.DateField(null=True, blank=True)
    # CHOICES SCENARIO 4 — long list (~20 values) to verify popup max-height +
    # internal scroll. If the popup grows past 240px it should scroll, not overflow.
    country = models.CharField(
        max_length=2,
        choices=[
            ('ar', 'Argentina'), ('br', 'Brazil'), ('cl', 'Chile'), ('co', 'Colombia'),
            ('mx', 'Mexico'), ('pe', 'Peru'), ('uy', 'Uruguay'), ('ve', 'Venezuela'),
            ('es', 'Spain'), ('pt', 'Portugal'), ('fr', 'France'), ('de', 'Germany'),
            ('it', 'Italy'), ('uk', 'United Kingdom'), ('us', 'United States'),
            ('ca', 'Canada'), ('au', 'Australia'), ('jp', 'Japan'), ('cn', 'China'),
            ('in', 'India'),
        ],
        default='ar',
    )
    user = models.OneToOneField('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    team = models.ForeignKey(Team, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    position = models.ForeignKey(Position, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    manager = models.ForeignKey('self', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.first_name)

class ContractType(models.Model):
    """Auto-generated hr.ContractType for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class Contract(models.Model):
    """Auto-generated hr.Contract for diagram stress testing."""
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    salary = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    contract_type = models.ForeignKey(ContractType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.starts_on)

class LeaveType(models.Model):
    """Auto-generated hr.LeaveType for diagram stress testing."""
    name = models.CharField(max_length=200)
    paid = models.BooleanField(default=False)

    def __str__(self):
        return str(self.name)

class LeaveRequest(models.Model):
    """Auto-generated hr.LeaveRequest for diagram stress testing."""
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=200)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.starts_on)

class LeaveBalance(models.Model):
    """Auto-generated hr.LeaveBalance for diagram stress testing."""
    days = models.FloatField(default=0.0)
    year = models.IntegerField(default=0)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    leave_type = models.ForeignKey(LeaveType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.days)

class Benefit(models.Model):
    """Auto-generated hr.Benefit for diagram stress testing."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self):
        return str(self.name)

class EmployeeBenefit(models.Model):
    """Auto-generated hr.EmployeeBenefit for diagram stress testing."""
    enrolled_on = models.DateField(null=True, blank=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    benefit = models.ForeignKey(Benefit, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.enrolled_on)

class PayrollRun(models.Model):
    """Auto-generated hr.PayrollRun for diagram stress testing."""
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)
    run_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return str(self.period_start)

class Payslip(models.Model):
    """Auto-generated hr.Payslip for diagram stress testing."""
    gross = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    net = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    run = models.ForeignKey(PayrollRun, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.gross)

class PerformanceReview(models.Model):
    """Auto-generated hr.PerformanceReview for diagram stress testing."""
    period = models.CharField(max_length=200)
    overall_rating = models.FloatField(default=0.0)
    notes = models.TextField(blank=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    reviewer = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.period)

class Goal(models.Model):
    """Auto-generated hr.Goal for diagram stress testing."""
    title = models.CharField(max_length=200)
    due_on = models.DateField(null=True, blank=True)
    progress = models.FloatField(default=0.0)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    review = models.ForeignKey(PerformanceReview, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class Skill(models.Model):
    """Auto-generated hr.Skill for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class EmployeeSkill(models.Model):
    """Auto-generated hr.EmployeeSkill for diagram stress testing."""
    proficiency = models.IntegerField(default=0)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    skill = models.ForeignKey(Skill, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.proficiency)

class Attendance(models.Model):
    """Auto-generated hr.Attendance for diagram stress testing."""
    date = models.DateField(null=True, blank=True)
    clock_in = models.DateTimeField(auto_now_add=True)
    clock_out = models.DateTimeField(auto_now_add=True)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.date)

class Holiday(models.Model):
    """Auto-generated hr.Holiday for diagram stress testing."""
    name = models.CharField(max_length=200)
    date = models.DateField(null=True, blank=True)

    def __str__(self):
        return str(self.name)

class WorkSchedule(models.Model):
    """Auto-generated hr.WorkSchedule for diagram stress testing."""
    name = models.CharField(max_length=200)
    hours_per_week = models.FloatField(default=0.0)
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)
