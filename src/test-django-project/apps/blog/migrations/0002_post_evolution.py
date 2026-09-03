"""Evolution migration 0002_post_evolution for `blog`."""
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('blog', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='post',
            name='subtitle',
            field=models.CharField(blank=True, max_length=300),
        ),
        migrations.AddField(
            model_name='post',
            name='word_count',
            field=models.IntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='post',
            name='title',
            field=models.CharField(max_length=300),
        ),
        migrations.AddField(
            model_name='comment',
            name='is_pinned',
            field=models.BooleanField(default=False),
        ),
    ]
