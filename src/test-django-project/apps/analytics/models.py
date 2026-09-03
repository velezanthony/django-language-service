"""Auto-generated models for app `analytics` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models

class Project(models.Model):
    """Auto-generated analytics.Project for diagram stress testing."""
    name = models.CharField(max_length=200)
    token = models.UUIDField(default=__import__('uuid').uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return str(self.name)

class Event(models.Model):
    """Auto-generated analytics.Event for diagram stress testing."""
    name = models.CharField(max_length=200, db_comment="Tabla que almacena los productos disponibles")
    occurred_at = models.DateTimeField(auto_now_add=True)
    payload = models.JSONField(default=dict, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)
    
    class Meta:
            db_table_comment = "Tabla que almacena los productos disponibles"

class Session(models.Model):
    """Auto-generated analytics.Session for diagram stress testing."""
    session_id = models.UUIDField(default=__import__('uuid').uuid4, editable=False)
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateField(null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.session_id)

class Metric(models.Model):
    """Auto-generated analytics.Metric for diagram stress testing."""
    name = models.CharField(max_length=200)
    unit = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class MetricValue(models.Model):
    """Auto-generated analytics.MetricValue for diagram stress testing."""
    value = models.FloatField(default=0.0)
    recorded_at = models.DateTimeField(auto_now_add=True)
    metric = models.ForeignKey(Metric, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.value)

class Dashboard(models.Model):
    """Auto-generated analytics.Dashboard for diagram stress testing."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Widget(models.Model):
    """Auto-generated analytics.Widget for diagram stress testing."""
    title = models.CharField(max_length=200)
    widget_type = models.CharField(max_length=200)
    config = models.JSONField(default=dict, blank=True)
    dashboard = models.ForeignKey(Dashboard, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    metric = models.ForeignKey(Metric, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class Funnel(models.Model):
    """Auto-generated analytics.Funnel for diagram stress testing."""
    name = models.CharField(max_length=200)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class FunnelStep(models.Model):
    """Auto-generated analytics.FunnelStep for diagram stress testing."""
    name = models.CharField(max_length=200)
    position = models.IntegerField(default=0)
    funnel = models.ForeignKey(Funnel, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Cohort(models.Model):
    """Auto-generated analytics.Cohort for diagram stress testing."""
    name = models.CharField(max_length=200)
    definition = models.JSONField(default=dict, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class CohortMember(models.Model):
    """Auto-generated analytics.CohortMember for diagram stress testing."""
    external_id = models.CharField(max_length=200)
    joined_at = models.DateTimeField(auto_now_add=True)
    cohort = models.ForeignKey(Cohort, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.external_id)

class Campaign(models.Model):
    """Auto-generated analytics.Campaign for diagram stress testing."""
    name = models.CharField(max_length=200)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class UTM(models.Model):
    """Auto-generated analytics.UTM for diagram stress testing."""
    source = models.CharField(max_length=200)
    medium = models.CharField(max_length=200)
    content = models.CharField(max_length=200)
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.source)

class Goal(models.Model):
    """Auto-generated analytics.Goal for diagram stress testing."""
    name = models.CharField(max_length=200)
    target_value = models.FloatField(default=0.0)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    metric = models.ForeignKey(Metric, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Attribution(models.Model):
    """Auto-generated analytics.Attribution for diagram stress testing."""
    model_name = models.CharField(max_length=200)
    goal = models.ForeignKey(Goal, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    campaign = models.ForeignKey(Campaign, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.model_name)

class DataSource(models.Model):
    """Auto-generated analytics.DataSource for diagram stress testing."""
    name = models.CharField(max_length=200)
    config = models.JSONField(default=dict, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Pipeline(models.Model):
    """Auto-generated analytics.Pipeline for diagram stress testing."""
    name = models.CharField(max_length=200)
    is_active = models.BooleanField(default=False)
    source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Aggregation(models.Model):
    """Auto-generated analytics.Aggregation for diagram stress testing."""
    name = models.CharField(max_length=200)
    formula = models.TextField(blank=True)
    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    metrics = models.ManyToManyField(Metric, related_name='+', blank=True)

    def __str__(self):
        return str(self.name)

class Alert(models.Model):
    """Auto-generated analytics.Alert for diagram stress testing."""
    name = models.CharField(max_length=200)
    threshold = models.FloatField(default=0.0)
    is_enabled = models.BooleanField(default=False)
    metric = models.ForeignKey(Metric, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class AlertSubscription(models.Model):
    """Auto-generated analytics.AlertSubscription for diagram stress testing."""
    channel = models.CharField(max_length=200)
    alert = models.ForeignKey(Alert, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.channel)
