"""Auto-generated initial migration for `blog`."""
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
            name='Author',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('email', models.EmailField(max_length=254)),
                ('bio', models.TextField(blank=True)),
                ('joined', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='Category',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=220, unique=True)),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.category')),
            ],
        ),
        migrations.CreateModel(
            name='Tag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=220, unique=True)),
                ('usage_count', models.IntegerField(default=0)),
            ],
        ),
        migrations.CreateModel(
            name='Post',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField(blank=True)),
                ('published_at', models.DateField(null=True, blank=True)),
                ('is_featured', models.BooleanField(default=False)),
                ('views', models.IntegerField(default=0)),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.category')),
                ('tags', models.ManyToManyField(blank=True, related_name='+', to='blog.tag')),
            ],
            options={
                'db_table': 'blog_posts',
                'ordering': ['-published_at'],
            },
        ),
        migrations.CreateModel(
            name='PostRevision',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body_snapshot', models.TextField(blank=True)),
                ('revised_at', models.DateTimeField(auto_now_add=True)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
                ('editor', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
            ],
        ),
        migrations.CreateModel(
            name='Comment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('is_hidden', models.BooleanField(default=False)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.comment')),
            ],
        ),
        migrations.CreateModel(
            name='Attachment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('file_path', models.CharField(max_length=200)),
                ('mime_type', models.CharField(max_length=200)),
                ('size_bytes', models.IntegerField(default=0)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
            ],
        ),
        migrations.CreateModel(
            name='Series',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
                ('posts', models.ManyToManyField(blank=True, related_name='+', to='blog.post')),
            ],
        ),
        migrations.CreateModel(
            name='Newsletter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='Subscriber',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('email', models.EmailField(max_length=254)),
                ('subscribed_at', models.DateTimeField(auto_now_add=True)),
                ('is_active', models.BooleanField(default=False)),
                ('newsletter', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.newsletter')),
            ],
        ),
        migrations.CreateModel(
            name='Issue',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject', models.CharField(max_length=200)),
                ('body', models.TextField(blank=True)),
                ('sent_at', models.DateField(null=True, blank=True)),
                ('newsletter', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.newsletter')),
            ],
        ),
        migrations.CreateModel(
            name='Bookmark',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('note', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
            ],
        ),
        migrations.CreateModel(
            name='Like',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
            ],
        ),
        migrations.CreateModel(
            name='Report',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('reason', models.CharField(max_length=200)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('is_resolved', models.BooleanField(default=False)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
                ('reporter', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
            ],
        ),
        migrations.CreateModel(
            name='SEOMeta',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('meta_title', models.CharField(max_length=200)),
                ('meta_description', models.TextField(blank=True)),
                ('canonical_url', models.URLField(blank=True)),
                ('post', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
            ],
        ),
        migrations.CreateModel(
            name='Redirect',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('from_path', models.CharField(max_length=200)),
                ('to_path', models.CharField(max_length=200)),
                ('is_permanent', models.BooleanField(default=False)),
            ],
        ),
        migrations.CreateModel(
            name='Feed',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=220, unique=True)),
                ('is_enabled', models.BooleanField(default=False)),
                ('categories', models.ManyToManyField(blank=True, related_name='+', to='blog.category')),
            ],
        ),
        migrations.CreateModel(
            name='Draft',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('body', models.TextField(blank=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
            ],
        ),
        migrations.CreateModel(
            name='TagAlias',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('alias', models.CharField(max_length=200)),
                ('tag', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.tag')),
            ],
        ),
        migrations.CreateModel(
            name='EditorialNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('post', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.post')),
                ('editor', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='blog.author')),
            ],
        ),
    ]
