"""Evolution migration 0003_rename_and_cleanup for `blog`."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('blog', '0002_post_evolution'),
    ]

    operations = [
        migrations.RenameField(
            model_name='post',
            old_name='views',
            new_name='view_count',
        ),
        migrations.RemoveField(
            model_name='report',
            name='is_resolved',
        ),
        migrations.AddIndex(
            model_name='post',
            index=models.Index(fields=['published_at'], name='blog_post_publish_idx'),
        ),
    ]
