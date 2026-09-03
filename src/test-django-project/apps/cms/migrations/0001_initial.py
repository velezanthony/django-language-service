"""Auto-generated initial migration for `cms`."""
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
            name='Locale',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=200)),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='Theme',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('config', models.JSONField(blank=True, default=dict)),
            ],
        ),
        migrations.CreateModel(
            name='Template',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('path', models.CharField(max_length=200)),
                ('theme', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.theme')),
            ],
        ),
        migrations.CreateModel(
            name='Layout',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('grid', models.JSONField(blank=True, default=dict)),
                ('template', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.template')),
            ],
        ),
        migrations.CreateModel(
            name='Page',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('slug', models.SlugField(max_length=220, unique=True)),
                ('is_published', models.BooleanField(default=False)),
                ('layout', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.layout')),
                ('locale', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.locale')),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.page')),
            ],
        ),
        migrations.CreateModel(
            name='PageVersion',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('version', models.IntegerField(default=0)),
                ('content', models.JSONField(blank=True, default=dict)),
                ('saved_at', models.DateTimeField(auto_now_add=True)),
                ('page', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.page')),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='BlockType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('schema', models.JSONField(blank=True, default=dict)),
            ],
        ),
        migrations.CreateModel(
            name='Block',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('data', models.JSONField(blank=True, default=dict)),
                ('block_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.blocktype')),
                ('page', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.page')),
            ],
        ),
        migrations.CreateModel(
            name='MenuItem',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=200)),
                ('url', models.URLField(blank=True)),
                ('order', models.IntegerField(default=0)),
                ('parent', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.menuitem')),
                ('page', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.page')),
            ],
        ),
        migrations.CreateModel(
            name='Menu',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('location', models.CharField(max_length=200)),
                ('items', models.ManyToManyField(blank=True, related_name='+', to='cms.menuitem')),
            ],
        ),
        migrations.CreateModel(
            name='MediaCategory',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='Media',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('file_path', models.CharField(max_length=200)),
                ('mime', models.CharField(max_length=200)),
                ('category', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.mediacategory')),
            ],
        ),
        migrations.CreateModel(
            name='ContentType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('schema', models.JSONField(blank=True, default=dict)),
            ],
        ),
        migrations.CreateModel(
            name='SiteSetting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=200)),
                ('value', models.JSONField(blank=True, default=dict)),
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
            name='SitemapEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('path', models.CharField(max_length=200)),
                ('priority', models.FloatField(default=0.0)),
                ('last_mod', models.DateField(null=True, blank=True)),
                ('page', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.page')),
            ],
        ),
        migrations.CreateModel(
            name='SearchIndex',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('terms', models.TextField(blank=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('page', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.page')),
            ],
        ),
        migrations.CreateModel(
            name='Translation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('key', models.CharField(max_length=200)),
                ('value', models.TextField(blank=True)),
                ('locale', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.locale')),
            ],
        ),
        migrations.CreateModel(
            name='Widget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('config', models.JSONField(blank=True, default=dict)),
                ('block_type', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.blocktype')),
            ],
        ),
        migrations.CreateModel(
            name='WidgetInstance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('position', models.IntegerField(default=0)),
                ('widget', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.widget')),
                ('page', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='cms.page')),
            ],
        ),
    ]
