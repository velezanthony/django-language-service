"""Auto-generated models for app `projects` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models

class Project(models.Model):
    """Auto-generated projects.Project for diagram stress testing."""
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    owner = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class ProjectMember(models.Model):
    """Auto-generated projects.ProjectMember for diagram stress testing."""
    role = models.CharField(max_length=200)
    joined_at = models.DateTimeField(auto_now_add=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.role)

class Milestone(models.Model):
    """Auto-generated projects.Milestone for diagram stress testing."""
    title = models.CharField(max_length=200)
    due_on = models.DateField(null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class IssueStatus(models.Model):
    """Auto-generated projects.IssueStatus for diagram stress testing."""
    name = models.CharField(max_length=200)
    is_terminal = models.BooleanField(default=False)

    def __str__(self):
        return str(self.name)

class IssuePriority(models.Model):
    """Auto-generated projects.IssuePriority for diagram stress testing."""
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)

    def __str__(self):
        return str(self.name)

class IssueType(models.Model):
    """Auto-generated projects.IssueType for diagram stress testing."""
    name = models.CharField(max_length=200)
    icon = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class IssueLabel(models.Model):
    """Auto-generated projects.IssueLabel for diagram stress testing."""
    name = models.CharField(max_length=200)
    color = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class Issue(models.Model):
    """Auto-generated projects.Issue for diagram stress testing."""
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    milestone = models.ForeignKey(Milestone, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    status = models.ForeignKey(IssueStatus, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    priority = models.ForeignKey(IssuePriority, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    issue_type = models.ForeignKey(IssueType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    reporter = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    assignee = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    labels = models.ManyToManyField(IssueLabel, related_name='+', blank=True)

    def __str__(self):
        return str(self.title)

class IssueComment(models.Model):
    """Auto-generated projects.IssueComment for diagram stress testing."""
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    author = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.body)

class IssueAttachment(models.Model):
    """Auto-generated projects.IssueAttachment for diagram stress testing."""
    file_path = models.CharField(max_length=200)
    size = models.IntegerField(default=0)
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.file_path)

class IssueLink(models.Model):
    """Auto-generated projects.IssueLink for diagram stress testing."""
    link_type = models.CharField(max_length=200)
    source = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    target = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.link_type)

class Sprint(models.Model):
    """Auto-generated projects.Sprint for diagram stress testing."""
    name = models.CharField(max_length=200)
    starts_on = models.DateField(null=True, blank=True)
    ends_on = models.DateField(null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class SprintIssue(models.Model):
    """Auto-generated projects.SprintIssue for diagram stress testing."""
    story_points = models.IntegerField(default=0)
    sprint = models.ForeignKey(Sprint, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.story_points)

class Release(models.Model):
    """Auto-generated projects.Release for diagram stress testing."""
    version = models.CharField(max_length=200)
    released_on = models.DateField(null=True, blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    issues = models.ManyToManyField(Issue, related_name='+', blank=True)

    def __str__(self):
        return str(self.version)

class Epic(models.Model):
    """Auto-generated projects.Epic for diagram stress testing."""
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class Story(models.Model):
    """Auto-generated projects.Story for diagram stress testing."""
    title = models.CharField(max_length=200)
    points = models.IntegerField(default=0)
    epic = models.ForeignKey(Epic, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    issue = models.OneToOneField(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class Worklog(models.Model):
    """Auto-generated projects.Worklog for diagram stress testing."""
    hours = models.FloatField(default=0.0)
    logged_on = models.DateField(null=True, blank=True)
    notes = models.TextField(blank=True)
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.hours)

class Board(models.Model):
    """Auto-generated projects.Board for diagram stress testing."""
    name = models.CharField(max_length=200)
    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class BoardColumn(models.Model):
    """Auto-generated projects.BoardColumn for diagram stress testing."""
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    status = models.ForeignKey(IssueStatus, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class BoardCard(models.Model):
    """Auto-generated projects.BoardCard for diagram stress testing."""
    order = models.IntegerField(default=0)
    column = models.ForeignKey(BoardColumn, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    issue = models.ForeignKey(Issue, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.order)
