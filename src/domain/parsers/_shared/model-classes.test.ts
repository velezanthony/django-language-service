import { describe, it, expect } from 'vitest';
import { detectModelClasses } from './model-classes';

const names = (src: string) => [...detectModelClasses(src)].sort();

describe('detectModelClasses', () => {
  it('accepts the plain and qualified Django base', () => {
    expect(
      names(
        [
          'class A(models.Model):',
          '    x = models.CharField(max_length=1)',
          'class B(django.db.models.Model):',
          '    x = models.CharField(max_length=1)',
          'class C(Model):',
          '    x = models.CharField(max_length=1)',
        ].join('\n'),
      ),
    ).toEqual(['A', 'B', 'C']);
  });

  // The pattern Django's own docs tell you to use on day one.
  it('accepts the auth bases', () => {
    expect(
      names(
        [
          'class User(AbstractUser):',
          '    phone = models.CharField(max_length=20)',
          'class Svc(AbstractBaseUser, PermissionsMixin):',
          '    email = models.EmailField()',
        ].join('\n'),
      ),
    ).toEqual(['Svc', 'User']);
  });

  // A base nobody can whitelist — django-mptt, django-extensions, whatever
  // ships next year. Declaring a model field is what gives it away.
  it('accepts any base when the class declares model fields', () => {
    expect(
      names(['class Node(MPTTModel):', '    title = models.CharField(max_length=50)'].join('\n')),
    ).toEqual(['Node']);
  });

  // Transitive: the local abstract base is a model, so its children are too —
  // even the ones that add no fields of their own.
  it('follows a project-local abstract base', () => {
    expect(
      names(
        [
          'class TimeStamped(models.Model):',
          '    created_at = models.DateTimeField(auto_now_add=True)',
          '    class Meta:',
          '        abstract = True',
          'class Marker(TimeStamped):',
          '    pass',
        ].join('\n'),
      ),
    ).toEqual(['Marker', 'TimeStamped']);
  });

  it('follows a chain of local bases', () => {
    expect(
      names(
        [
          'class A(models.Model):',
          '    x = models.CharField(max_length=1)',
          'class B(A):',
          '    pass',
          'class C(B):',
          '    pass',
        ].join('\n'),
      ),
    ).toEqual(['A', 'B', 'C']);
  });

  it('leaves classes that are plainly not models alone', () => {
    expect(
      names(
        [
          'class Helper:',
          '    def run(self):',
          '        return 1',
          'class Command(BaseCommand):',
          '    help = "does a thing"',
          'class Form(forms.ModelForm):',
          '    pass',
        ].join('\n'),
      ),
    ).toEqual([]);
  });

  // A nested `class Meta:` is not a model, and neither is a nested TextChoices.
  it('ignores nested classes', () => {
    expect(
      names(
        [
          'class Post(models.Model):',
          '    class Meta:',
          '        ordering = ["id"]',
          '    class Status(models.TextChoices):',
          '        DRAFT = "d", "Draft"',
          '    title = models.CharField(max_length=1)',
        ].join('\n'),
      ),
    ).toEqual(['Post']);
  });

  it('returns nothing for an empty file', () => {
    expect(names('')).toEqual([]);
  });
});
