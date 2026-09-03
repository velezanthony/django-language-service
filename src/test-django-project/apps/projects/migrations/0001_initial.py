"""Auto-generated initial migration for `projects`."""
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
            name='Project',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=220, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='ProjectMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('role', models.CharField(max_length=200)),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.project')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Milestone',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('due_on', models.DateField(null=True, blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.project')),
            ],
        ),
        migrations.CreateModel(
            name='IssueStatus',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('is_terminal', models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name='IssuePriority',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('order', models.IntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='IssueType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('icon', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='IssueLabel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('color', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='Issue',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.project')),
                ('milestone', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.milestone')),
                ('status', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issuestatus')),
                ('priority', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issuepriority')),
                ('issue_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issuetype')),
                ('reporter', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('assignee', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('labels', models.ManyToManyField(blank=True, related_name='+', to='projects.issuelabel')),
            ],
        ),
        migrations.CreateModel(
            name='IssueComment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('issue', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='IssueAttachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file_path', models.CharField(max_length=200)),
                ('size', models.IntegerField(default=0)),
                ('issue', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
            ],
        ),
        migrations.CreateModel(
            name='IssueLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('link_type', models.CharField(max_length=200)),
                ('source', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
                ('target', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
            ],
        ),
        migrations.CreateModel(
            name='Sprint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('starts_on', models.DateField(null=True, blank=True)),
                ('ends_on', models.DateField(null=True, blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.project')),
            ],
        ),
        migrations.CreateModel(
            name='SprintIssue',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('story_points', models.IntegerField(default=0)),
                ('sprint', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.sprint')),
                ('issue', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
            ],
        ),
        migrations.CreateModel(
            name='Release',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version', models.CharField(max_length=200)),
                ('released_on', models.DateField(null=True, blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.project')),
                ('issues', models.ManyToManyField(blank=True, related_name='+', to='projects.issue')),
            ],
        ),
        migrations.CreateModel(
            name='Epic',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.project')),
            ],
        ),
        migrations.CreateModel(
            name='Story',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('points', models.IntegerField(default=0)),
                ('epic', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.epic')),
                ('issue', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
            ],
        ),
        migrations.CreateModel(
            name='Worklog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('hours', models.FloatField(default=0.0)),
                ('logged_on', models.DateField(null=True, blank=True)),
                ('notes', models.TextField(blank=True)),
                ('issue', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Board',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.project')),
            ],
        ),
        migrations.CreateModel(
            name='BoardColumn',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('order', models.IntegerField(default=0)),
                ('board', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.board')),
                ('status', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issuestatus')),
            ],
        ),
        migrations.CreateModel(
            name='BoardCard',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('order', models.IntegerField(default=0)),
                ('column', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.boardcolumn')),
                ('issue', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='projects.issue')),
            ],
        ),
    ]
