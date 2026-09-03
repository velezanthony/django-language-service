"""Auto-generated models for app `forum` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models

class Forum(models.Model):
    """Auto-generated forum.Forum for diagram stress testing."""
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True)

    def __str__(self):
        return str(self.name)

class Thread(models.Model):
    """Auto-generated forum.Thread for diagram stress testing."""
    title = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    is_locked = models.BooleanField(default=False)
    forum = models.ForeignKey(Forum, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    author = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class Post(models.Model):
    """Auto-generated forum.Post for diagram stress testing."""
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    is_deleted = models.BooleanField(default=False)
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    author = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    reply_to = models.ForeignKey('self', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.body)

class Vote(models.Model):
    """Auto-generated forum.Vote for diagram stress testing."""
    value = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    voter = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.value)

class Reaction(models.Model):
    """Auto-generated forum.Reaction for diagram stress testing."""
    emoji = models.CharField(max_length=200)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.emoji)

class Attachment(models.Model):
    """Auto-generated forum.Attachment for diagram stress testing."""
    file_path = models.CharField(max_length=200)
    size = models.IntegerField(default=0)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.file_path)

class Badge(models.Model):
    """Auto-generated forum.Badge for diagram stress testing."""
    name = models.CharField(max_length=200)
    icon = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class UserBadge(models.Model):
    """Auto-generated forum.UserBadge for diagram stress testing."""
    awarded_at = models.DateTimeField(auto_now_add=True)
    badge = models.ForeignKey(Badge, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.awarded_at)

class ModerationAction(models.Model):
    """Auto-generated forum.ModerationAction for diagram stress testing."""
    action = models.CharField(max_length=200)
    reason = models.TextField(blank=True)
    acted_at = models.DateTimeField(auto_now_add=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    moderator = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.action)

class Report(models.Model):
    """Auto-generated forum.Report for diagram stress testing."""
    reason = models.CharField(max_length=200)
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    reporter = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.reason)

class Poll(models.Model):
    """Auto-generated forum.Poll for diagram stress testing."""
    question = models.CharField(max_length=200)
    closes_at = models.DateTimeField(auto_now_add=True)
    thread = models.OneToOneField(Thread, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.question)

class PollOption(models.Model):
    """Auto-generated forum.PollOption for diagram stress testing."""
    label = models.CharField(max_length=200)
    poll = models.ForeignKey(Poll, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.label)

class PollVote(models.Model):
    """Auto-generated forum.PollVote for diagram stress testing."""
    voted_at = models.DateTimeField(auto_now_add=True)
    option = models.ForeignKey(PollOption, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    voter = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.voted_at)

class ThreadSubscription(models.Model):
    """Auto-generated forum.ThreadSubscription for diagram stress testing."""
    subscribed_at = models.DateTimeField(auto_now_add=True)
    thread = models.ForeignKey(Thread, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.subscribed_at)

class Notification(models.Model):
    """Auto-generated forum.Notification for diagram stress testing."""
    kind = models.CharField(max_length=200)
    created_at = models.DateTimeField(auto_now_add=True)
    read = models.BooleanField(default=False)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.kind)

class UserPreference(models.Model):
    """Auto-generated forum.UserPreference for diagram stress testing."""
    key = models.CharField(max_length=200)
    value = models.CharField(max_length=200)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.key)

class Mention(models.Model):
    """Auto-generated forum.Mention for diagram stress testing."""
    created_at = models.DateTimeField(auto_now_add=True)
    post = models.ForeignKey(Post, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    mentioned = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.created_at)

class TagBlacklist(models.Model):
    """Auto-generated forum.TagBlacklist for diagram stress testing."""
    tag = models.CharField(max_length=200)
    forum = models.ForeignKey(Forum, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.tag)

class ForumRole(models.Model):
    """Auto-generated forum.ForumRole for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class ForumMembership(models.Model):
    """Auto-generated forum.ForumMembership for diagram stress testing."""
    joined_at = models.DateTimeField(auto_now_add=True)
    forum = models.ForeignKey(Forum, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    user = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    role = models.ForeignKey(ForumRole, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.joined_at)
