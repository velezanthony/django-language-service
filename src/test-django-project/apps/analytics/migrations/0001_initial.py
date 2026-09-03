"""Auto-generated initial migration for `analytics`."""
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
                ('token', models.UUIDField(default=uuid.uuid4, editable=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
        ),
        migrations.CreateModel(
            name='Event',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('occurred_at', models.DateTimeField(auto_now_add=True)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='Session',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_id', models.UUIDField(default=uuid.uuid4, editable=False)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('ended_at', models.DateField(null=True, blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='Metric',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('unit', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='MetricValue',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('value', models.FloatField(default=0.0)),
                ('recorded_at', models.DateTimeField(auto_now_add=True)),
                ('metric', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.metric')),
            ],
        ),
        migrations.CreateModel(
            name='Dashboard',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('description', models.TextField(blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='Widget',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('widget_type', models.CharField(max_length=200)),
                ('config', models.JSONField(blank=True, default=dict)),
                ('dashboard', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.dashboard')),
                ('metric', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.metric')),
            ],
        ),
        migrations.CreateModel(
            name='Funnel',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='FunnelStep',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('position', models.IntegerField(default=0)),
                ('funnel', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.funnel')),
            ],
        ),
        migrations.CreateModel(
            name='Cohort',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('definition', models.JSONField(blank=True, default=dict)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='CohortMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('external_id', models.CharField(max_length=200)),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('cohort', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.cohort')),
            ],
        ),
        migrations.CreateModel(
            name='Campaign',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('starts_on', models.DateField(null=True, blank=True)),
                ('ends_on', models.DateField(null=True, blank=True)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='UTM',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('source', models.CharField(max_length=200)),
                ('medium', models.CharField(max_length=200)),
                ('content', models.CharField(max_length=200)),
                ('campaign', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.campaign')),
            ],
        ),
        migrations.CreateModel(
            name='Goal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('target_value', models.FloatField(default=0.0)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
                ('metric', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.metric')),
            ],
        ),
        migrations.CreateModel(
            name='Attribution',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('model_name', models.CharField(max_length=200)),
                ('goal', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.goal')),
                ('campaign', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.campaign')),
            ],
        ),
        migrations.CreateModel(
            name='DataSource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('config', models.JSONField(blank=True, default=dict)),
                ('project', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.project')),
            ],
        ),
        migrations.CreateModel(
            name='Pipeline',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('is_active', models.BooleanField(default=False)),
                ('source', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.datasource')),
            ],
        ),
        migrations.CreateModel(
            name='Aggregation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('formula', models.TextField(blank=True)),
                ('pipeline', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.pipeline')),
                ('metrics', models.ManyToManyField(blank=True, related_name='+', to='analytics.metric')),
            ],
        ),
        migrations.CreateModel(
            name='Alert',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('threshold', models.FloatField(default=0.0)),
                ('is_enabled', models.BooleanField(default=False)),
                ('metric', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.metric')),
            ],
        ),
        migrations.CreateModel(
            name='AlertSubscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('channel', models.CharField(max_length=200)),
                ('alert', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='analytics.alert')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
    ]
