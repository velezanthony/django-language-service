"""Auto-generated models for app `cms` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models

class Locale(models.Model):
    """Auto-generated cms.Locale for diagram stress testing."""
    code = models.CharField(max_length=200)
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.code)

class Theme(models.Model):
    """Auto-generated cms.Theme for diagram stress testing."""
    name = models.CharField(max_length=200)
    config = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return str(self.name)

class Template(models.Model):
    """Auto-generated cms.Template for diagram stress testing."""
    name = models.CharField(max_length=200)
    path = models.CharField(max_length=200)
    theme = models.ForeignKey(Theme, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Layout(models.Model):
    """Auto-generated cms.Layout for diagram stress testing."""
    name = models.CharField(max_length=200)
    grid = models.JSONField(default=dict, blank=True)
    template = models.ForeignKey(Template, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Page(models.Model):
    """Auto-generated cms.Page for diagram stress testing."""
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    is_published = models.BooleanField(default=False)
    # CHOICES SCENARIO 2 — medium list (5 values) to check chip+popup spacing.
    visibility = models.CharField(
        max_length=20,
        choices=[
            ('public', 'Public'),
            ('private', 'Private'),
            ('draft', 'Draft'),
            ('archived', 'Archived'),
            ('scheduled', 'Scheduled'),
        ],
        default='draft',
    )
    layout = models.ForeignKey(Layout, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    locale = models.ForeignKey(Locale, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class PageVersion(models.Model):
    """Auto-generated cms.PageVersion for diagram stress testing."""
    version = models.IntegerField(default=0)
    content = models.JSONField(default=dict, blank=True)
    saved_at = models.DateTimeField(auto_now_add=True)
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    author = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.version)

class BlockType(models.Model):
    """Auto-generated cms.BlockType for diagram stress testing."""
    name = models.CharField(max_length=200)
    schema = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return str(self.name)

class Block(models.Model):
    """Auto-generated cms.Block for diagram stress testing."""
    name = models.CharField(max_length=200)
    data = models.JSONField(default=dict, blank=True)
    block_type = models.ForeignKey(BlockType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class MenuItem(models.Model):
    """Auto-generated cms.MenuItem for diagram stress testing."""
    label = models.CharField(max_length=200)
    url = models.URLField(blank=True)
    order = models.IntegerField(default=0)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.label)

class Menu(models.Model):
    """Auto-generated cms.Menu for diagram stress testing."""
    name = models.CharField(max_length=200)
    location = models.CharField(max_length=200)
    items = models.ManyToManyField(MenuItem, related_name='+', blank=True)

    def __str__(self):
        return str(self.name)

class MediaCategory(models.Model):
    """Auto-generated cms.MediaCategory for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class Media(models.Model):
    """Auto-generated cms.Media for diagram stress testing."""
    title = models.CharField(max_length=200)
    file_path = models.CharField(max_length=200)
    mime = models.CharField(max_length=200)
    category = models.ForeignKey(MediaCategory, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class ContentType(models.Model):
    """Auto-generated cms.ContentType for diagram stress testing."""
    name = models.CharField(max_length=200)
    schema = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return str(self.name)

class SiteSetting(models.Model):
    """Auto-generated cms.SiteSetting for diagram stress testing."""
    key = models.CharField(max_length=200)
    value = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return str(self.key)

class Redirect(models.Model):
    """Auto-generated cms.Redirect for diagram stress testing."""
    from_path = models.CharField(max_length=200)
    to_path = models.CharField(max_length=200)
    is_permanent = models.BooleanField(default=False)

    def __str__(self):
        return str(self.from_path)

class SitemapEntry(models.Model):
    """Auto-generated cms.SitemapEntry for diagram stress testing."""
    path = models.CharField(max_length=200)
    priority = models.FloatField(default=0.0)
    last_mod = models.DateField(null=True, blank=True)
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.path)

class SearchIndex(models.Model):
    """Auto-generated cms.SearchIndex for diagram stress testing."""
    terms = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    page = models.OneToOneField(Page, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.terms)

class Translation(models.Model):
    """Auto-generated cms.Translation for diagram stress testing."""
    key = models.CharField(max_length=200)
    value = models.TextField(blank=True)
    locale = models.ForeignKey(Locale, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.key)

class Widget(models.Model):
    """Auto-generated cms.Widget for diagram stress testing."""
    name = models.CharField(max_length=200)
    config = models.JSONField(default=dict, blank=True)
    block_type = models.ForeignKey(BlockType, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class WidgetInstance(models.Model):
    """Auto-generated cms.WidgetInstance for diagram stress testing."""
    position = models.IntegerField(default=0)
    widget = models.ForeignKey(Widget, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.position)
