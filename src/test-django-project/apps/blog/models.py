"""Auto-generated models for app `blog` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models


# CHOICES SCENARIO 5 — same-file TextChoices class with explicit labels.
# Verifies: parseTextChoicesClasses detects the class, parseField resolves
# `choices=PostStatus.choices` to kind='resolved' with symbolName='PostStatus'.
class PostStatus(models.TextChoices):
    DRAFT = 'draft', 'Draft'
    REVIEW = 'review', 'In Review'
    PUBLISHED = 'published', 'Published'
    ARCHIVED = 'archived', 'Archived'


# CHOICES SCENARIO 6 — IntegerChoices class (int values + labels).
# Verifies: int values stringified ('1','2','3') in the popup.
class PostVisibility(models.IntegerChoices):
    PRIVATE = 1, 'Private'
    UNLISTED = 2, 'Unlisted'
    PUBLIC = 3, 'Public'


class Author(models.Model):
    """Auto-generated blog.Author for diagram stress testing."""
    name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254)
    bio = models.TextField(blank=True)
    joined = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return str(self.name)

class Category(models.Model):
    """Auto-generated blog.Category for diagram stress testing."""
    name = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Tag(models.Model):
    """Auto-generated blog.Tag for diagram stress testing."""
    label = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    usage_count = models.IntegerField(default=0)

    def __str__(self):
        return str(self.label)

class Post(models.Model):
    """Auto-generated blog.Post for diagram stress testing."""
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    # CHOICES SCENARIO 1 — simple inline string-pair, 3 values + labels.
    # Verifies: chip renders, popup shows value+label rows, basic spacing OK.
    featured_format = models.CharField(
        max_length=20,
        choices=[('standard', 'Standard'), ('gallery', 'Gallery'), ('video', 'Video')],
        default='standard',
    )
    # CHOICES SCENARIO 5 (continued) — references the same-file PostStatus TextChoices.
    # Both `Status.choices` and the bare `Status` (Django 4+) forms are accepted.
    status = models.CharField(max_length=20, choices=PostStatus.choices, default='draft')
    # CHOICES SCENARIO 6 (continued) — IntegerChoices class same-file via bare ref.
    visibility = models.IntegerField(choices=PostVisibility, default=3)
    published_at = models.DateField(null=True, blank=True)
    is_featured = models.BooleanField(default=False)
    views = models.IntegerField(default=0)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    category = models.ForeignKey(Category, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    tags = models.ManyToManyField(Tag, related_name='+', blank=True)

    class Meta:
        db_table = 'blog_posts'
        ordering = ['-published_at']

    @property
    def is_published(self):
        return bool(self.pk)  # placeholder

    @property
    def reading_time(self):
        return bool(self.pk)  # placeholder

    def __str__(self):
        return str(self.title)

class PostRevision(models.Model):
    """Auto-generated blog.PostRevision for diagram stress testing."""
    body_snapshot = models.TextField(blank=True)
    revised_at = models.DateTimeField(auto_now_add=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    editor = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.body_snapshot)

class Comment(models.Model):
    """Auto-generated blog.Comment for diagram stress testing."""
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_hidden = models.BooleanField(default=False)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.body)

class Attachment(models.Model):
    """Auto-generated blog.Attachment for diagram stress testing."""
    file_path = models.CharField(max_length=200)
    mime_type = models.CharField(max_length=200)
    size_bytes = models.IntegerField(default=0)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.file_path)

class Series(models.Model):
    """Auto-generated blog.Series for diagram stress testing."""
    title = models.CharField(max_length=200)
    description = models.TextField(blank=True)
    owner = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    posts = models.ManyToManyField(Post, related_name='+', blank=True)

    def __str__(self):
        return str(self.title)

class Newsletter(models.Model):
    """Auto-generated blog.Newsletter for diagram stress testing."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self):
        return str(self.name)

class Subscriber(models.Model):
    """Auto-generated blog.Subscriber for diagram stress testing."""
    email = models.EmailField(max_length=254)
    subscribed_at = models.DateTimeField(auto_now_add=True)
    is_active = models.BooleanField(default=False)
    newsletter = models.ForeignKey(Newsletter, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.email)

class Issue(models.Model):
    """Auto-generated blog.Issue for diagram stress testing."""
    subject = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    sent_at = models.DateField(null=True, blank=True)
    newsletter = models.ForeignKey(Newsletter, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.subject)

class Bookmark(models.Model):
    """Auto-generated blog.Bookmark for diagram stress testing."""
    note = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.note)

class Like(models.Model):
    """Auto-generated blog.Like for diagram stress testing."""
    created_at = models.DateTimeField(auto_now_add=True)
    user = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.created_at)

class Report(models.Model):
    """Auto-generated blog.Report for diagram stress testing."""
    reason = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    is_resolved = models.BooleanField(default=False)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    reporter = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.reason)

class SEOMeta(models.Model):
    """Auto-generated blog.SEOMeta for diagram stress testing."""
    meta_title = models.CharField(max_length=200)
    meta_description = models.TextField(blank=True)
    canonical_url = models.URLField(blank=True)
    post = models.OneToOneField(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.meta_title)

class Redirect(models.Model):
    """Auto-generated blog.Redirect for diagram stress testing."""
    from_path = models.CharField(max_length=200)
    to_path = models.CharField(max_length=200)
    is_permanent = models.BooleanField(default=False)

    def __str__(self):
        return str(self.from_path)

class Feed(models.Model):
    """Auto-generated blog.Feed for diagram stress testing."""
    title = models.CharField(max_length=200)
    slug = models.SlugField(max_length=220, unique=True)
    is_enabled = models.BooleanField(default=False)
    categories = models.ManyToManyField(Category, related_name='+', blank=True)

    def __str__(self):
        return str(self.title)

class Draft(models.Model):
    """Auto-generated blog.Draft for diagram stress testing."""
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)
    author = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class TagAlias(models.Model):
    """Auto-generated blog.TagAlias for diagram stress testing."""
    alias = models.CharField(max_length=200)
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.alias)

class EditorialNote(models.Model):
    """Auto-generated blog.EditorialNote for diagram stress testing."""
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    editor = models.ForeignKey(Author, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.body)
