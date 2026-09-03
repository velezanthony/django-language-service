"""Custom user model + shared abstract bases.

Every class here inherits from something OTHER than `models.Model`, which is the
normal shape of a real Django project and the one the parser is weakest at:

  - `AbstractUser` — the recommended way to define AUTH_USER_MODEL. Django's own
    docs tell you to do this on day one of a project.
  - `AbstractBaseUser, PermissionsMixin` — the fuller variant, used when the
    default username/email split does not fit.
  - A project-local abstract base (`TimeStampedModel`) — the single most common
    piece of shared model code there is.

If any of these go undetected, the models disappear from the diagram entirely:
no box, no relations, and anything pointing at them looks like it points
outside the project.
"""
from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, AbstractUser, PermissionsMixin
from django.db import models


class TimeStampedModel(models.Model):
    """Project-local abstract base. Detected today (it names models.Model)."""

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class User(AbstractUser):
    """AUTH_USER_MODEL. Inherits Django's AbstractUser, not models.Model."""

    phone = models.CharField(max_length=20, blank=True, db_comment="E.164, no spaces")
    is_verified = models.BooleanField(default=False)
    organisation = models.ForeignKey(
        'accounts.Organisation',
        on_delete=models.PROTECT,
        related_name='members',
        null=True,
        blank=True,
    )

    class Meta:
        db_table = 'accounts_user'

    @property
    def display_name(self):
        """Falls back to the username when no full name is set."""
        full = self.get_full_name()
        return full or self.username


class ServiceAccount(AbstractBaseUser, PermissionsMixin):
    """The fuller variant: no username, email is the identifier."""

    email = models.EmailField(unique=True)
    label = models.CharField(max_length=80)

    USERNAME_FIELD = 'email'


class Organisation(TimeStampedModel):
    """Inherits a project-local abstract base, not models.Model."""

    name = models.CharField(max_length=120)
    slug = models.SlugField(unique=True)
    owner = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='owned_organisation',
    )

    def __str__(self):
        return self.name


class ApiKey(TimeStampedModel):
    """Second consumer of the abstract base, so the pattern is not a one-off."""

    organisation = models.ForeignKey(
        Organisation,
        on_delete=models.CASCADE,
        related_name='api_keys',
    )
    prefix = models.CharField(max_length=8, unique=True)
    label = models.CharField(max_length=60)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        # Every table-level shape the exports have to render, in one place:
        # the deprecated-but-everywhere unique_together, a named multi-column
        # index with a descending column, and the UniqueConstraint the Django
        # docs now point you at instead of unique_together.
        unique_together = [("prefix", "label")]
        indexes = [
            models.Index(fields=["label", "-revoked_at"], name="apikey_label_rev_idx"),
        ]
        constraints = [
            models.UniqueConstraint(fields=["label"], name="apikey_label_uniq"),
        ]

    @property
    def is_active(self):
        return self.revoked_at is None
