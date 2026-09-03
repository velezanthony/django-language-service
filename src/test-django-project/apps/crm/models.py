"""Auto-generated models for app `crm` — stress-testing the diagram tool.

Total models in this app: 20.
Regenerate via `python scripts/generate_test_models.py`.
"""
import uuid
from django.db import models


# STRESS-TEST FIXTURE — DetailedProfile has 30+ fields spanning many Django field types.
# Used to verify the tooltip's internal scroll kicks in when content overflows the viewport.
# The class lives at top of the file so it sits prominently in the diagram.
class DetailedProfile(models.Model):
    """Stress-test fixture: many fields covering varied types + choices + db_comment +
    a couple of relations, used to verify the tooltip's `tt-body` scroll behavior."""

    # ── Identity (5)
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    username = models.CharField(max_length=150, unique=True)
    first_name = models.CharField(max_length=100)
    last_name = models.CharField(max_length=100)
    display_name = models.CharField(max_length=200, blank=True, db_comment="Optional override for how the name shows in lists")

    # ── Contact (5)
    email = models.EmailField(max_length=254)
    secondary_email = models.EmailField(max_length=254, blank=True)
    phone = models.CharField(max_length=30, blank=True)
    secondary_phone = models.CharField(max_length=30, blank=True)
    website = models.URLField(max_length=200, blank=True)

    # ── Address (6)
    address_line1 = models.CharField(max_length=200, blank=True)
    address_line2 = models.CharField(max_length=200, blank=True)
    city = models.CharField(max_length=100, blank=True)
    region = models.CharField(max_length=100, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(
        max_length=2,
        blank=True,
        choices=[
            ('ar', 'Argentina'), ('br', 'Brazil'), ('cl', 'Chile'),
            ('es', 'Spain'), ('uk', 'United Kingdom'), ('us', 'United States'),
        ],
    )

    # ── Demographics (4)
    birth_date = models.DateField(null=True, blank=True)
    gender = models.CharField(
        max_length=20,
        blank=True,
        choices=[('m', 'Male'), ('f', 'Female'), ('nb', 'Non-binary'), ('other', 'Other')],
    )
    pronouns = models.CharField(max_length=50, blank=True)
    locale = models.CharField(max_length=10, default='en-US')

    # ── Status flags (4)
    is_active = models.BooleanField(default=True)
    is_verified = models.BooleanField(default=False)
    accepts_marketing = models.BooleanField(default=False, db_comment="GDPR opt-in flag")
    tier = models.CharField(
        max_length=20,
        default='free',
        choices=[('free', 'Free'), ('pro', 'Pro'), ('enterprise', 'Enterprise')],
    )

    # ── Numbers (4)
    score = models.IntegerField(default=0)
    lifetime_value = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    balance = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    referral_count = models.IntegerField(default=0)

    # ── Timestamps (4)
    joined = models.DateTimeField(auto_now_add=True)
    last_login = models.DateTimeField(null=True, blank=True)
    updated = models.DateTimeField(auto_now=True)
    activated_at = models.DateTimeField(null=True, blank=True)

    # ── Long-form text (2)
    bio = models.TextField(blank=True, db_comment="Public bio shown on the profile page")
    internal_notes = models.TextField(blank=True, db_comment="Sales team only — never displayed publicly")

    # ── Relations (2, FK target Account + self-FK for hierarchy)
    account = models.ForeignKey('Account', on_delete=models.CASCADE, related_name='profiles', null=True, blank=True)
    referred_by = models.ForeignKey('self', on_delete=models.SET_NULL, related_name='referrals', null=True, blank=True)

    def __str__(self):
        return self.username


class Account(models.Model):
    """Auto-generated crm.Account for diagram stress testing."""
    name = models.CharField(max_length=200)
    industry = models.CharField(max_length=200)
    website = models.URLField(blank=True)

    def __str__(self):
        return str(self.name)

class Contact(models.Model):
    """Auto-generated crm.Contact for diagram stress testing."""
    first_name = models.CharField(max_length=200)
    last_name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254)
    phone = models.CharField(max_length=200)
    # CHOICES SCENARIO 3 — IntegerField with int values + string labels.
    # Verifies: the parser captures int values and stringifies them ('1','2','3','4').
    priority = models.IntegerField(
        choices=[(1, 'Low'), (2, 'Medium'), (3, 'High'), (4, 'Critical')],
        default=2,
    )
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.first_name)

class Lead(models.Model):
    """Auto-generated crm.Lead for diagram stress testing."""
    name = models.CharField(max_length=200)
    email = models.EmailField(max_length=254)
    score = models.IntegerField(default=0)
    owner = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class LeadSource(models.Model):
    """Auto-generated crm.LeadSource for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class LeadScore(models.Model):
    """Auto-generated crm.LeadScore for diagram stress testing."""
    value = models.IntegerField(default=0)
    computed_at = models.DateTimeField(auto_now_add=True)
    lead = models.OneToOneField(Lead, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.value)

class Pipeline(models.Model):
    """Auto-generated crm.Pipeline for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class DealStage(models.Model):
    """Auto-generated crm.DealStage for diagram stress testing."""
    name = models.CharField(max_length=200)
    order = models.IntegerField(default=0)
    probability = models.FloatField(default=0.0)
    pipeline = models.ForeignKey(Pipeline, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class Deal(models.Model):
    """Auto-generated crm.Deal for diagram stress testing."""
    name = models.CharField(max_length=200)
    value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    closed_at = models.DateField(null=True, blank=True)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    stage = models.ForeignKey(DealStage, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    owner = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    products = models.ManyToManyField('shop.Product', related_name='+', blank=True)

    def __str__(self):
        return str(self.name)

class Activity(models.Model):
    """Auto-generated crm.Activity for diagram stress testing."""
    subject = models.CharField(max_length=200)
    notes = models.TextField(blank=True)
    happened_at = models.DateTimeField(auto_now_add=True)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.subject)

class ActivityType(models.Model):
    """Auto-generated crm.ActivityType for diagram stress testing."""
    name = models.CharField(max_length=200)

    def __str__(self):
        return str(self.name)

class Task(models.Model):
    """Auto-generated crm.Task for diagram stress testing."""
    title = models.CharField(max_length=200)
    due_at = models.DateTimeField(auto_now_add=True)
    is_done = models.BooleanField(default=False)
    assigned_to = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.title)

class Meeting(models.Model):
    """Auto-generated crm.Meeting for diagram stress testing."""
    title = models.CharField(max_length=200)
    starts_at = models.DateTimeField(auto_now_add=True)
    duration_minutes = models.IntegerField(default=0)
    organizer = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    deal = models.ForeignKey(Deal, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    attendees = models.ManyToManyField(Contact, related_name='+', blank=True)

    def __str__(self):
        return str(self.title)

class Note(models.Model):
    """Auto-generated crm.Note for diagram stress testing."""
    body = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    author = models.ForeignKey('auth.User', on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.body)

class Segment(models.Model):
    """Auto-generated crm.Segment for diagram stress testing."""
    name = models.CharField(max_length=200)
    criteria = models.JSONField(default=dict, blank=True)

    def __str__(self):
        return str(self.name)

class SegmentMember(models.Model):
    """Auto-generated crm.SegmentMember for diagram stress testing."""
    joined_at = models.DateTimeField(auto_now_add=True)
    segment = models.ForeignKey(Segment, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.joined_at)

class EmailTemplate(models.Model):
    """Auto-generated crm.EmailTemplate for diagram stress testing."""
    subject = models.CharField(max_length=200)
    body_html = models.TextField(blank=True)

    def __str__(self):
        return str(self.subject)

class EmailCampaign(models.Model):
    """Auto-generated crm.EmailCampaign for diagram stress testing."""
    name = models.CharField(max_length=200)
    sent_at = models.DateField(null=True, blank=True)
    template = models.ForeignKey(EmailTemplate, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    segment = models.ForeignKey(Segment, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.name)

class EmailOpen(models.Model):
    """Auto-generated crm.EmailOpen for diagram stress testing."""
    opened_at = models.DateTimeField(auto_now_add=True)
    campaign = models.ForeignKey(EmailCampaign, on_delete=models.CASCADE, related_name='+', null=True, blank=True)
    contact = models.ForeignKey(Contact, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.opened_at)

class EmailClick(models.Model):
    """Auto-generated crm.EmailClick for diagram stress testing."""
    clicked_at = models.DateTimeField(auto_now_add=True)
    url = models.URLField(blank=True)
    open = models.ForeignKey(EmailOpen, on_delete=models.CASCADE, related_name='+', null=True, blank=True)

    def __str__(self):
        return str(self.clicked_at)

class Tag(models.Model):
    """Auto-generated crm.Tag for diagram stress testing."""
    name = models.CharField(max_length=200)
    accounts = models.ManyToManyField(Account, related_name='+', blank=True)

    def __str__(self):
        return str(self.name)
