"""Auto-generated initial migration for `crm`."""
import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('contenttypes', '0002_remove_content_type_name'),
        ('shop', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Account',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('industry', models.CharField(max_length=200)),
                ('website', models.URLField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='Contact',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('first_name', models.CharField(max_length=200)),
                ('last_name', models.CharField(max_length=200)),
                ('email', models.EmailField(max_length=254)),
                ('phone', models.CharField(max_length=200)),
                ('account', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.account')),
            ],
        ),
        migrations.CreateModel(
            name='Lead',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('email', models.EmailField(max_length=254)),
                ('score', models.IntegerField(default=0)),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
            ],
        ),
        migrations.CreateModel(
            name='LeadSource',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='LeadScore',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('value', models.IntegerField(default=0)),
                ('computed_at', models.DateTimeField(auto_now_add=True)),
                ('lead', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.lead')),
            ],
        ),
        migrations.CreateModel(
            name='Pipeline',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='DealStage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('order', models.IntegerField(default=0)),
                ('probability', models.FloatField(default=0.0)),
                ('pipeline', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.pipeline')),
            ],
        ),
        migrations.CreateModel(
            name='Deal',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('value', models.DecimalField(decimal_places=2, default=0, max_digits=12)),
                ('closed_at', models.DateField(null=True, blank=True)),
                ('account', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.account')),
                ('stage', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.dealstage')),
                ('owner', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('products', models.ManyToManyField(blank=True, related_name='+', to='shop.product')),
            ],
        ),
        migrations.CreateModel(
            name='Activity',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject', models.CharField(max_length=200)),
                ('notes', models.TextField(blank=True)),
                ('happened_at', models.DateTimeField(auto_now_add=True)),
                ('contact', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.contact')),
                ('deal', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.deal')),
            ],
        ),
        migrations.CreateModel(
            name='ActivityType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
            ],
        ),
        migrations.CreateModel(
            name='Task',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('due_at', models.DateTimeField(auto_now_add=True)),
                ('is_done', models.BooleanField(default=False)),
                ('assigned_to', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('deal', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.deal')),
            ],
        ),
        migrations.CreateModel(
            name='Meeting',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=200)),
                ('starts_at', models.DateTimeField(auto_now_add=True)),
                ('duration_minutes', models.IntegerField(default=0)),
                ('organizer', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('deal', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.deal')),
                ('attendees', models.ManyToManyField(blank=True, related_name='+', to='crm.contact')),
            ],
        ),
        migrations.CreateModel(
            name='Note',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('body', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='auth.user')),
                ('account', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.account')),
            ],
        ),
        migrations.CreateModel(
            name='Segment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('criteria', models.JSONField(blank=True, default=dict)),
            ],
        ),
        migrations.CreateModel(
            name='SegmentMember',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('joined_at', models.DateTimeField(auto_now_add=True)),
                ('segment', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.segment')),
                ('contact', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.contact')),
            ],
        ),
        migrations.CreateModel(
            name='EmailTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('subject', models.CharField(max_length=200)),
                ('body_html', models.TextField(blank=True)),
            ],
        ),
        migrations.CreateModel(
            name='EmailCampaign',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('sent_at', models.DateField(null=True, blank=True)),
                ('template', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.emailtemplate')),
                ('segment', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.segment')),
            ],
        ),
        migrations.CreateModel(
            name='EmailOpen',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('opened_at', models.DateTimeField(auto_now_add=True)),
                ('campaign', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.emailcampaign')),
                ('contact', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.contact')),
            ],
        ),
        migrations.CreateModel(
            name='EmailClick',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('clicked_at', models.DateTimeField(auto_now_add=True)),
                ('url', models.URLField(blank=True)),
                ('open', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to='crm.emailopen')),
            ],
        ),
        migrations.CreateModel(
            name='Tag',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=200)),
                ('accounts', models.ManyToManyField(blank=True, related_name='+', to='crm.account')),
            ],
        ),
    ]
