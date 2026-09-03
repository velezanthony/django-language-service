# Fixture: Migration with AddIndex operation (unsupported op — should warn+skip)
# Inspired by wagtail search index migrations
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('catalogue', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='Product',
            name='search_score',
            field=models.FloatField(default=0.0),
        ),
        migrations.AddIndex(
            model_name='Product',
            index=models.Index(fields=['search_score'], name='product_score_idx'),
        ),
    ]
