"""Auto-generated initial migration for `forum`."""
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
            name='Forum',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='Thread',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('is_locked', models.BooleanField(default=False)),
                ('forum', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.forum')),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Post',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('is_deleted', models.BooleanField(default=False)),
                ('thread', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.thread')),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('reply_to', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
            ],
        ),
        migrations.CreateModel(
            name='Vote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('value', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
                ('voter', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Reaction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('emoji', models.CharField(max_length=200)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Attachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file_path', models.CharField(max_length=200)),
                ('size', models.IntegerField(default=0)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
            ],
        ),
        migrations.CreateModel(
            name='Badge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('icon', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='UserBadge',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('awarded_at', models.DateTimeField(auto_now_add=True)),
                ('badge', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.badge')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='ModerationAction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=200)),
                ('reason', models.TextField(blank=True)),
                ('acted_at', models.DateTimeField(auto_now_add=True)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
                ('moderator', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Report',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.CharField(max_length=200)),
                ('is_resolved', models.BooleanField(default=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
                ('reporter', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Poll',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('question', models.CharField(max_length=200)),
                ('closes_at', models.DateTimeField(auto_now_add=True)),
                ('thread', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.thread')),
            ],
        ),
        migrations.CreateModel(
            name='PollOption',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=200)),
                ('poll', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.poll')),
            ],
        ),
        migrations.CreateModel(
            name='PollVote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('voted_at', models.DateTimeField(auto_now_add=True)),
                ('option', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.polloption')),
                ('voter', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='ThreadSubscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subscribed_at', models.DateTimeField(auto_now_add=True)),
                ('thread', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.thread')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('kind', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('read', models.BooleanField(default=False)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
            ],
        ),
        migrations.CreateModel(
            name='UserPreference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=200)),
                ('value', models.CharField(max_length=200)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='Mention',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.post')),
                ('mentioned', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='TagBlacklist',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('tag', models.CharField(max_length=200)),
                ('forum', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.forum')),
            ],
        ),
        migrations.CreateModel(
            name='ForumRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='ForumMembership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('forum', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.forum')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('role', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='forum.forumrole')),
            ],
        ),
    ]
