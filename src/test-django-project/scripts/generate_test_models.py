"""
Generates 10 Django apps with ~20 models each (≈200 total) for stress-testing
the ER diagram, migrations timeline, and grouping features of the extension.

Run from the test-django-project root:
    python scripts/generate_test_models.py

This creates apps/*/{__init__.py,apps.py,models.py,migrations/__init__.py,migrations/0001_initial.py}
and patches config/settings.py INSTALLED_APPS.

Re-running is safe: it overwrites the generated files.
"""
from __future__ import annotations
import os
import re
import textwrap
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
APPS_DIR = ROOT / 'apps'
SETTINGS = ROOT / 'config' / 'settings.py'

# Field shorthand: C=CharField, T=TextField, I=IntegerField, B=BooleanField,
# D=DateField, DT=DateTimeField, F=FloatField, DE=DecimalField, S=SlugField,
# E=EmailField, U=URLField, J=JSONField, UUID=UUIDField.
FIELD_MAP = {
    'C': "models.CharField(max_length=200)",
    'T': "models.TextField(blank=True)",
    'I': "models.IntegerField(default=0)",
    'B': "models.BooleanField(default=False)",
    'D': "models.DateField(null=True, blank=True)",
    'DT': "models.DateTimeField(auto_now_add=True)",
    'DTU': "models.DateTimeField(auto_now=True)",
    'F': "models.FloatField(default=0.0)",
    'DE': "models.DecimalField(max_digits=12, decimal_places=2, default=0)",
    'S': "models.SlugField(max_length=220, unique=True)",
    'E': "models.EmailField(max_length=254)",
    'U': "models.URLField(blank=True)",
    'J': "models.JSONField(default=dict, blank=True)",
    'UUID': "models.UUIDField(default=__import__('uuid').uuid4, editable=False)",
}

# Each app is a dict of model_name -> definition.
# Definition is a dict with keys:
#   fields: list of (name, shorthand)
#   relations: list of (name, kind, target)  kind ∈ {'FK','M2M','O2O'}  target is 'App.Model' or 'Model' (same app) or 'self'
#   meta: optional dict with keys db_table, verbose_name, ordering
#   properties: optional list of property names (generates @property)

# ── blog app ─────────────────────────────────────────────────────────────
BLOG = {
    'Author':      {'fields': [('name','C'),('email','E'),('bio','T'),('joined','DT')]},
    'Category':    {'fields': [('name','C'),('slug','S')], 'relations': [('parent','FK','self')]},
    'Tag':         {'fields': [('label','C'),('slug','S'),('usage_count','I')]},
    'Post':        {'fields': [('title','C'),('body','T'),('published_at','D'),('is_featured','B'),('views','I')],
                    'relations': [('author','FK','Author'),('category','FK','Category'),('tags','M2M','Tag')],
                    'meta': {'db_table': 'blog_posts', 'ordering': ['-published_at']},
                    'properties': ['is_published','reading_time']},
    'PostRevision':{'fields': [('body_snapshot','T'),('revised_at','DT')], 'relations': [('post','FK','Post'),('editor','FK','Author')]},
    'Comment':     {'fields': [('body','T'),('created_at','DT'),('is_hidden','B')],
                    'relations': [('post','FK','Post'),('author','FK','Author'),('parent','FK','self')]},
    'Attachment':  {'fields': [('file_path','C'),('mime_type','C'),('size_bytes','I')], 'relations': [('post','FK','Post')]},
    'Series':      {'fields': [('title','C'),('description','T')], 'relations': [('owner','FK','Author'),('posts','M2M','Post')]},
    'Newsletter':  {'fields': [('name','C'),('description','T')]},
    'Subscriber':  {'fields': [('email','E'),('subscribed_at','DT'),('is_active','B')], 'relations': [('newsletter','FK','Newsletter')]},
    'Issue':       {'fields': [('subject','C'),('body','T'),('sent_at','D')], 'relations': [('newsletter','FK','Newsletter')]},
    'Bookmark':    {'fields': [('note','T'),('created_at','DT')], 'relations': [('user','FK','Author'),('post','FK','Post')]},
    'Like':        {'fields': [('created_at','DT')], 'relations': [('user','FK','Author'),('post','FK','Post')]},
    'Report':      {'fields': [('reason','C'),('created_at','DT'),('is_resolved','B')], 'relations': [('post','FK','Post'),('reporter','FK','Author')]},
    'SEOMeta':     {'fields': [('meta_title','C'),('meta_description','T'),('canonical_url','U')], 'relations': [('post','O2O','Post')]},
    'Redirect':    {'fields': [('from_path','C'),('to_path','C'),('is_permanent','B')]},
    'Feed':        {'fields': [('title','C'),('slug','S'),('is_enabled','B')], 'relations': [('categories','M2M','Category')]},
    'Draft':       {'fields': [('title','C'),('body','T'),('updated_at','DTU')], 'relations': [('author','FK','Author')]},
    'TagAlias':    {'fields': [('alias','C')], 'relations': [('tag','FK','Tag')]},
    'EditorialNote':{'fields':[('body','T'),('created_at','DT')], 'relations': [('post','FK','Post'),('editor','FK','Author')]},
}

# ── analytics app ────────────────────────────────────────────────────────
ANALYTICS = {
    'Project':       {'fields': [('name','C'),('token','UUID'),('created_at','DT')]},
    'Event':         {'fields': [('name','C'),('occurred_at','DT'),('payload','J')], 'relations': [('project','FK','Project')]},
    'Session':       {'fields': [('session_id','UUID'),('started_at','DT'),('ended_at','D')], 'relations': [('project','FK','Project')]},
    'Metric':        {'fields': [('name','C'),('unit','C'),('description','T')], 'relations': [('project','FK','Project')]},
    'MetricValue':   {'fields': [('value','F'),('recorded_at','DT')], 'relations': [('metric','FK','Metric')]},
    'Dashboard':     {'fields': [('name','C'),('description','T')], 'relations': [('project','FK','Project')]},
    'Widget':        {'fields': [('title','C'),('widget_type','C'),('config','J')], 'relations': [('dashboard','FK','Dashboard'),('metric','FK','Metric')]},
    'Funnel':        {'fields': [('name','C')], 'relations': [('project','FK','Project')]},
    'FunnelStep':    {'fields': [('name','C'),('position','I')], 'relations': [('funnel','FK','Funnel')]},
    'Cohort':        {'fields': [('name','C'),('definition','J')], 'relations': [('project','FK','Project')]},
    'CohortMember':  {'fields': [('external_id','C'),('joined_at','DT')], 'relations': [('cohort','FK','Cohort')]},
    'Campaign':      {'fields': [('name','C'),('starts_on','D'),('ends_on','D')], 'relations': [('project','FK','Project')]},
    'UTM':           {'fields': [('source','C'),('medium','C'),('content','C')], 'relations': [('campaign','FK','Campaign')]},
    'Goal':          {'fields': [('name','C'),('target_value','F')], 'relations': [('project','FK','Project'),('metric','FK','Metric')]},
    'Attribution':   {'fields': [('model_name','C')], 'relations': [('goal','FK','Goal'),('campaign','FK','Campaign')]},
    'DataSource':    {'fields': [('name','C'),('config','J')], 'relations': [('project','FK','Project')]},
    'Pipeline':      {'fields': [('name','C'),('is_active','B')], 'relations': [('source','FK','DataSource')]},
    'Aggregation':   {'fields': [('name','C'),('formula','T')], 'relations': [('pipeline','FK','Pipeline'),('metrics','M2M','Metric')]},
    'Alert':         {'fields': [('name','C'),('threshold','F'),('is_enabled','B')], 'relations': [('metric','FK','Metric')]},
    'AlertSubscription':{'fields':[('channel','C')], 'relations': [('alert','FK','Alert'),('user','FK','auth.User')]},
}

# ── inventory app ────────────────────────────────────────────────────────
INVENTORY = {
    'Warehouse':        {'fields': [('name','C'),('code','C'),('address','T')]},
    'Location':         {'fields': [('aisle','C'),('rack','C'),('bin','C')], 'relations': [('warehouse','FK','Warehouse')]},
    'Supplier':         {'fields': [('name','C'),('tax_id','C')]},
    'SupplierContact':  {'fields': [('name','C'),('email','E')], 'relations': [('supplier','FK','Supplier')]},
    'PurchaseOrder':    {'fields': [('number','C'),('created_at','DT'),('status','C')], 'relations': [('supplier','FK','Supplier')]},
    'PurchaseOrderLine':{'fields': [('quantity','I'),('unit_price','DE')], 'relations': [('po','FK','PurchaseOrder'),('product','FK','shop.Product')]},
    'StockLevel':       {'fields': [('quantity','I')], 'relations': [('product','FK','shop.Product'),('location','FK','Location')]},
    'StockMovement':    {'fields': [('quantity','I'),('movement_type','C'),('occurred_at','DT')], 'relations': [('stock_level','FK','StockLevel')]},
    'Transfer':         {'fields': [('reference','C'),('status','C')], 'relations': [('origin','FK','Warehouse'),('destination','FK','Warehouse')]},
    'TransferLine':     {'fields': [('quantity','I')], 'relations': [('transfer','FK','Transfer'),('product','FK','shop.Product')]},
    'Lot':              {'fields': [('code','C'),('expires_on','D')], 'relations': [('product','FK','shop.Product')]},
    'SerialNumber':     {'fields': [('value','C')], 'relations': [('lot','FK','Lot')]},
    'Carrier':          {'fields': [('name','C'),('tracking_url','U')]},
    'Shipment':         {'fields': [('tracking_code','C'),('shipped_at','D')], 'relations': [('carrier','FK','Carrier'),('po','FK','PurchaseOrder')]},
    'ShipmentLine':     {'fields': [('quantity','I')], 'relations': [('shipment','FK','Shipment'),('po_line','FK','PurchaseOrderLine')]},
    'StockAdjustment':  {'fields': [('quantity_delta','I'),('reason','C'),('adjusted_at','DT')], 'relations': [('stock_level','FK','StockLevel')]},
    'StockReservation': {'fields': [('quantity','I'),('reserved_until','DT')], 'relations': [('stock_level','FK','StockLevel')]},
    'Stocktake':        {'fields': [('started_at','DT'),('finished_at','D')], 'relations': [('warehouse','FK','Warehouse')]},
    'StocktakeLine':    {'fields': [('counted_quantity','I'),('system_quantity','I')], 'relations': [('stocktake','FK','Stocktake'),('product','FK','shop.Product')]},
    'Manifest':         {'fields': [('reference','C'),('created_at','DT')], 'relations': [('shipment','O2O','Shipment')]},
}

# ── crm app ───────────────────────────────────────────────────────────────
CRM = {
    'Account':      {'fields': [('name','C'),('industry','C'),('website','U')]},
    'Contact':      {'fields': [('first_name','C'),('last_name','C'),('email','E'),('phone','C')], 'relations': [('account','FK','Account')]},
    'Lead':         {'fields': [('name','C'),('email','E'),('score','I')], 'relations': [('owner','FK','auth.User')]},
    'LeadSource':   {'fields': [('name','C')]},
    'LeadScore':    {'fields': [('value','I'),('computed_at','DT')], 'relations': [('lead','O2O','Lead')]},
    'Pipeline':     {'fields': [('name','C')]},
    'DealStage':    {'fields': [('name','C'),('order','I'),('probability','F')], 'relations': [('pipeline','FK','Pipeline')]},
    'Deal':         {'fields': [('name','C'),('value','DE'),('closed_at','D')], 'relations': [('account','FK','Account'),('stage','FK','DealStage'),('owner','FK','auth.User'),('products','M2M','shop.Product')]},
    'Activity':     {'fields': [('subject','C'),('notes','T'),('happened_at','DT')], 'relations': [('contact','FK','Contact'),('deal','FK','Deal')]},
    'ActivityType': {'fields': [('name','C')]},
    'Task':         {'fields': [('title','C'),('due_at','DT'),('is_done','B')], 'relations': [('assigned_to','FK','auth.User'),('deal','FK','Deal')]},
    'Meeting':      {'fields': [('title','C'),('starts_at','DT'),('duration_minutes','I')], 'relations': [('organizer','FK','auth.User'),('deal','FK','Deal'),('attendees','M2M','Contact')]},
    'Note':         {'fields': [('body','T'),('created_at','DT')], 'relations': [('author','FK','auth.User'),('account','FK','Account')]},
    'Segment':      {'fields': [('name','C'),('criteria','J')]},
    'SegmentMember':{'fields': [('joined_at','DT')], 'relations': [('segment','FK','Segment'),('contact','FK','Contact')]},
    'EmailTemplate':{'fields': [('subject','C'),('body_html','T')]},
    'EmailCampaign':{'fields': [('name','C'),('sent_at','D')], 'relations': [('template','FK','EmailTemplate'),('segment','FK','Segment')]},
    'EmailOpen':    {'fields': [('opened_at','DT')], 'relations': [('campaign','FK','EmailCampaign'),('contact','FK','Contact')]},
    'EmailClick':   {'fields': [('clicked_at','DT'),('url','U')], 'relations': [('open','FK','EmailOpen')]},
    'Tag':          {'fields': [('name','C')], 'relations': [('accounts','M2M','Account')]},
}

# ── billing app ──────────────────────────────────────────────────────────
BILLING = {
    'Currency':        {'fields': [('code','C'),('symbol','C')]},
    'ExchangeRate':    {'fields': [('rate','DE'),('recorded_at','DT')], 'relations': [('base','FK','Currency'),('quote','FK','Currency')]},
    'TaxRate':         {'fields': [('name','C'),('percent','DE')]},
    'Plan':            {'fields': [('name','C'),('price','DE'),('interval','C')], 'relations': [('currency','FK','Currency')]},
    'Feature':         {'fields': [('name','C'),('description','T')]},
    'PlanFeature':     {'fields': [('quota','I')], 'relations': [('plan','FK','Plan'),('feature','FK','Feature')]},
    'Subscription':    {'fields': [('started_at','DT'),('ended_at','D'),('status','C')], 'relations': [('plan','FK','Plan'),('account','FK','crm.Account')]},
    'Invoice':         {'fields': [('number','C'),('issued_at','D'),('due_at','D'),('total','DE')], 'relations': [('account','FK','crm.Account'),('currency','FK','Currency'),('tax_rate','FK','TaxRate')]},
    'InvoiceLine':     {'fields': [('description','C'),('quantity','I'),('unit_price','DE')], 'relations': [('invoice','FK','Invoice')]},
    'PaymentProvider': {'fields': [('name','C'),('config','J')]},
    'PaymentMethod':   {'fields': [('label','C'),('last4','C'),('brand','C')], 'relations': [('account','FK','crm.Account'),('provider','FK','PaymentProvider')]},
    'Payment':         {'fields': [('amount','DE'),('paid_at','DT'),('status','C')], 'relations': [('invoice','FK','Invoice'),('method','FK','PaymentMethod')]},
    'Refund':          {'fields': [('amount','DE'),('refunded_at','DT'),('reason','C')], 'relations': [('payment','FK','Payment')]},
    'CreditNote':      {'fields': [('number','C'),('issued_at','D'),('total','DE')], 'relations': [('invoice','FK','Invoice')]},
    'Coupon':          {'fields': [('code','C'),('percent_off','DE'),('valid_until','D')]},
    'CouponRedemption':{'fields': [('redeemed_at','DT')], 'relations': [('coupon','FK','Coupon'),('invoice','FK','Invoice')]},
    'WebhookEvent':    {'fields': [('event_type','C'),('payload','J'),('received_at','DT')], 'relations': [('provider','FK','PaymentProvider')]},
    'Transaction':     {'fields': [('reference','C'),('amount','DE'),('occurred_at','DT')], 'relations': [('payment','FK','Payment')]},
    'DunningSchedule': {'fields': [('name','C'),('days_after_due','I')]},
    'DunningAttempt':  {'fields': [('attempted_at','DT'),('succeeded','B')], 'relations': [('invoice','FK','Invoice'),('schedule','FK','DunningSchedule')]},
}

# ── hr app ───────────────────────────────────────────────────────────────
HR = {
    'Department':      {'fields': [('name','C'),('cost_center','C')]},
    'Team':            {'fields': [('name','C')], 'relations': [('department','FK','Department')]},
    'Position':        {'fields': [('title','C'),('level','I')], 'relations': [('department','FK','Department')]},
    'Employee':        {'fields': [('first_name','C'),('last_name','C'),('email','E'),('hired_on','D')],
                        'relations': [('user','O2O','auth.User'),('department','FK','Department'),('team','FK','Team'),('position','FK','Position'),('manager','FK','self')]},
    'ContractType':    {'fields': [('name','C')]},
    'Contract':        {'fields': [('starts_on','D'),('ends_on','D'),('salary','DE')], 'relations': [('employee','FK','Employee'),('contract_type','FK','ContractType')]},
    'LeaveType':       {'fields': [('name','C'),('paid','B')]},
    'LeaveRequest':    {'fields': [('starts_on','D'),('ends_on','D'),('status','C')], 'relations': [('employee','FK','Employee'),('leave_type','FK','LeaveType')]},
    'LeaveBalance':    {'fields': [('days','F'),('year','I')], 'relations': [('employee','FK','Employee'),('leave_type','FK','LeaveType')]},
    'Benefit':         {'fields': [('name','C'),('description','T')]},
    'EmployeeBenefit': {'fields': [('enrolled_on','D')], 'relations': [('employee','FK','Employee'),('benefit','FK','Benefit')]},
    'PayrollRun':      {'fields': [('period_start','D'),('period_end','D'),('run_at','DT')]},
    'Payslip':         {'fields': [('gross','DE'),('net','DE')], 'relations': [('employee','FK','Employee'),('run','FK','PayrollRun')]},
    'PerformanceReview':{'fields': [('period','C'),('overall_rating','F'),('notes','T')], 'relations': [('employee','FK','Employee'),('reviewer','FK','Employee')]},
    'Goal':            {'fields': [('title','C'),('due_on','D'),('progress','F')], 'relations': [('employee','FK','Employee'),('review','FK','PerformanceReview')]},
    'Skill':           {'fields': [('name','C')]},
    'EmployeeSkill':   {'fields': [('proficiency','I')], 'relations': [('employee','FK','Employee'),('skill','FK','Skill')]},
    'Attendance':      {'fields': [('date','D'),('clock_in','DT'),('clock_out','DT')], 'relations': [('employee','FK','Employee')]},
    'Holiday':         {'fields': [('name','C'),('date','D')]},
    'WorkSchedule':    {'fields': [('name','C'),('hours_per_week','F')], 'relations': [('employee','FK','Employee')]},
}

# ── fleet app ────────────────────────────────────────────────────────────
FLEET = {
    'VehicleType':     {'fields': [('name','C'),('capacity','I')]},
    'Vehicle':         {'fields': [('plate','C'),('vin','C'),('year','I')], 'relations': [('vehicle_type','FK','VehicleType'),('owner','FK','hr.Employee')]},
    'Driver':          {'fields': [('license_number','C'),('expires_on','D')], 'relations': [('employee','O2O','hr.Employee')]},
    'DriverLicense':   {'fields': [('category','C'),('issued_on','D')], 'relations': [('driver','FK','Driver')]},
    'Route':           {'fields': [('name','C'),('distance_km','F')]},
    'RouteStop':       {'fields': [('name','C'),('sequence','I')], 'relations': [('route','FK','Route')]},
    'Trip':            {'fields': [('started_at','DT'),('ended_at','DT'),('distance_km','F')], 'relations': [('vehicle','FK','Vehicle'),('driver','FK','Driver'),('route','FK','Route')]},
    'TripLog':         {'fields': [('logged_at','DT'),('location','C')], 'relations': [('trip','FK','Trip')]},
    'FuelCard':        {'fields': [('number','C'),('issued_on','D')], 'relations': [('vehicle','FK','Vehicle')]},
    'FuelTransaction': {'fields': [('liters','F'),('amount','DE'),('when','DT')], 'relations': [('card','FK','FuelCard')]},
    'MaintenanceSchedule':{'fields': [('name','C'),('interval_km','I')], 'relations': [('vehicle_type','FK','VehicleType')]},
    'MaintenanceLog':  {'fields': [('performed_at','D'),('cost','DE'),('notes','T')], 'relations': [('vehicle','FK','Vehicle'),('schedule','FK','MaintenanceSchedule')]},
    'InsurancePolicy': {'fields': [('policy_number','C'),('starts_on','D'),('ends_on','D')], 'relations': [('vehicle','FK','Vehicle')]},
    'InsuranceClaim':  {'fields': [('claim_number','C'),('filed_on','D'),('amount','DE')], 'relations': [('policy','FK','InsurancePolicy')]},
    'GPSDevice':       {'fields': [('imei','C')], 'relations': [('vehicle','O2O','Vehicle')]},
    'GPSRecord':       {'fields': [('latitude','F'),('longitude','F'),('recorded_at','DT')], 'relations': [('device','FK','GPSDevice')]},
    'TollTransaction': {'fields': [('amount','DE'),('occurred_at','DT'),('location','C')], 'relations': [('vehicle','FK','Vehicle')]},
    'VehicleInspection':{'fields': [('inspected_at','DT'),('passed','B'),('notes','T')], 'relations': [('vehicle','FK','Vehicle'),('inspector','FK','hr.Employee')]},
    'InspectionChecklist':{'fields': [('name','C')]},
    'InspectionItem':  {'fields': [('label','C'),('is_passed','B')], 'relations': [('inspection','FK','VehicleInspection'),('checklist','FK','InspectionChecklist')]},
}

# ── cms app ──────────────────────────────────────────────────────────────
CMS = {
    'Locale':         {'fields': [('code','C'),('name','C')]},
    'Theme':          {'fields': [('name','C'),('config','J')]},
    'Template':       {'fields': [('name','C'),('path','C')], 'relations': [('theme','FK','Theme')]},
    'Layout':         {'fields': [('name','C'),('grid','J')], 'relations': [('template','FK','Template')]},
    'Page':           {'fields': [('title','C'),('slug','S'),('is_published','B')], 'relations': [('layout','FK','Layout'),('locale','FK','Locale'),('parent','FK','self')]},
    'PageVersion':    {'fields': [('version','I'),('content','J'),('saved_at','DT')], 'relations': [('page','FK','Page'),('author','FK','auth.User')]},
    'BlockType':      {'fields': [('name','C'),('schema','J')]},
    'Block':          {'fields': [('name','C'),('data','J')], 'relations': [('block_type','FK','BlockType'),('page','FK','Page')]},
    'MenuItem':       {'fields': [('label','C'),('url','U'),('order','I')], 'relations': [('parent','FK','self'),('page','FK','Page')]},
    'Menu':           {'fields': [('name','C'),('location','C')], 'relations': [('items','M2M','MenuItem')]},
    'MediaCategory':  {'fields': [('name','C')]},
    'Media':          {'fields': [('title','C'),('file_path','C'),('mime','C')], 'relations': [('category','FK','MediaCategory')]},
    'ContentType':    {'fields': [('name','C'),('schema','J')]},
    'SiteSetting':    {'fields': [('key','C'),('value','J')]},
    'Redirect':       {'fields': [('from_path','C'),('to_path','C'),('is_permanent','B')]},
    'SitemapEntry':   {'fields': [('path','C'),('priority','F'),('last_mod','D')], 'relations': [('page','FK','Page')]},
    'SearchIndex':    {'fields': [('terms','T'),('updated_at','DTU')], 'relations': [('page','O2O','Page')]},
    'Translation':    {'fields': [('key','C'),('value','T')], 'relations': [('locale','FK','Locale')]},
    'Widget':         {'fields': [('name','C'),('config','J')], 'relations': [('block_type','FK','BlockType')]},
    'WidgetInstance': {'fields': [('position','I')], 'relations': [('widget','FK','Widget'),('page','FK','Page')]},
}

# ── forum app ────────────────────────────────────────────────────────────
FORUM = {
    'Forum':        {'fields': [('name','C'),('description','T')]},
    'Thread':       {'fields': [('title','C'),('created_at','DT'),('is_locked','B')], 'relations': [('forum','FK','Forum'),('author','FK','auth.User')]},
    'Post':         {'fields': [('body','T'),('created_at','DT'),('is_deleted','B')], 'relations': [('thread','FK','Thread'),('author','FK','auth.User'),('reply_to','FK','self')]},
    'Vote':         {'fields': [('value','I'),('created_at','DT')], 'relations': [('post','FK','Post'),('voter','FK','auth.User')]},
    'Reaction':     {'fields': [('emoji','C')], 'relations': [('post','FK','Post'),('user','FK','auth.User')]},
    'Attachment':   {'fields': [('file_path','C'),('size','I')], 'relations': [('post','FK','Post')]},
    'Badge':        {'fields': [('name','C'),('icon','C')]},
    'UserBadge':    {'fields': [('awarded_at','DT')], 'relations': [('badge','FK','Badge'),('user','FK','auth.User')]},
    'ModerationAction':{'fields':[('action','C'),('reason','T'),('acted_at','DT')], 'relations': [('post','FK','Post'),('moderator','FK','auth.User')]},
    'Report':       {'fields': [('reason','C'),('is_resolved','B'),('created_at','DT')], 'relations': [('post','FK','Post'),('reporter','FK','auth.User')]},
    'Poll':         {'fields': [('question','C'),('closes_at','DT')], 'relations': [('thread','O2O','Thread')]},
    'PollOption':   {'fields': [('label','C')], 'relations': [('poll','FK','Poll')]},
    'PollVote':     {'fields': [('voted_at','DT')], 'relations': [('option','FK','PollOption'),('voter','FK','auth.User')]},
    'ThreadSubscription':{'fields':[('subscribed_at','DT')], 'relations': [('thread','FK','Thread'),('user','FK','auth.User')]},
    'Notification': {'fields': [('kind','C'),('created_at','DT'),('read','B')], 'relations': [('user','FK','auth.User'),('post','FK','Post')]},
    'UserPreference':{'fields':[('key','C'),('value','C')], 'relations': [('user','FK','auth.User')]},
    'Mention':      {'fields': [('created_at','DT')], 'relations': [('post','FK','Post'),('mentioned','FK','auth.User')]},
    'TagBlacklist': {'fields': [('tag','C')], 'relations': [('forum','FK','Forum')]},
    'ForumRole':    {'fields': [('name','C')]},
    'ForumMembership':{'fields':[('joined_at','DT')], 'relations': [('forum','FK','Forum'),('user','FK','auth.User'),('role','FK','ForumRole')]},
}

# ── projects app ─────────────────────────────────────────────────────────
PROJECTS = {
    'Project':       {'fields': [('name','C'),('slug','S'),('created_at','DT')], 'relations': [('owner','FK','auth.User')]},
    'ProjectMember': {'fields': [('role','C'),('joined_at','DT')], 'relations': [('project','FK','Project'),('user','FK','auth.User')]},
    'Milestone':     {'fields': [('title','C'),('due_on','D')], 'relations': [('project','FK','Project')]},
    'IssueStatus':   {'fields': [('name','C'),('is_terminal','B')]},
    'IssuePriority': {'fields': [('name','C'),('order','I')]},
    'IssueType':     {'fields': [('name','C'),('icon','C')]},
    'IssueLabel':    {'fields': [('name','C'),('color','C')]},
    'Issue':         {'fields': [('title','C'),('description','T'),('created_at','DT')],
                      'relations': [('project','FK','Project'),('milestone','FK','Milestone'),('status','FK','IssueStatus'),('priority','FK','IssuePriority'),('issue_type','FK','IssueType'),('reporter','FK','auth.User'),('assignee','FK','auth.User'),('labels','M2M','IssueLabel')]},
    'IssueComment':  {'fields': [('body','T'),('created_at','DT')], 'relations': [('issue','FK','Issue'),('author','FK','auth.User')]},
    'IssueAttachment':{'fields':[('file_path','C'),('size','I')], 'relations': [('issue','FK','Issue')]},
    'IssueLink':     {'fields': [('link_type','C')], 'relations': [('source','FK','Issue'),('target','FK','Issue')]},
    'Sprint':        {'fields': [('name','C'),('starts_on','D'),('ends_on','D')], 'relations': [('project','FK','Project')]},
    'SprintIssue':   {'fields': [('story_points','I')], 'relations': [('sprint','FK','Sprint'),('issue','FK','Issue')]},
    'Release':       {'fields': [('version','C'),('released_on','D')], 'relations': [('project','FK','Project'),('issues','M2M','Issue')]},
    'Epic':          {'fields': [('title','C'),('description','T')], 'relations': [('project','FK','Project')]},
    'Story':         {'fields': [('title','C'),('points','I')], 'relations': [('epic','FK','Epic'),('issue','O2O','Issue')]},
    'Worklog':       {'fields': [('hours','F'),('logged_on','D'),('notes','T')], 'relations': [('issue','FK','Issue'),('user','FK','auth.User')]},
    'Board':         {'fields': [('name','C')], 'relations': [('project','FK','Project')]},
    'BoardColumn':   {'fields': [('name','C'),('order','I')], 'relations': [('board','FK','Board'),('status','FK','IssueStatus')]},
    'BoardCard':     {'fields': [('order','I')], 'relations': [('column','FK','BoardColumn'),('issue','FK','Issue')]},
}

ALL_APPS = {
    'blog': BLOG,
    'analytics': ANALYTICS,
    'inventory': INVENTORY,
    'crm': CRM,
    'billing': BILLING,
    'hr': HR,
    'fleet': FLEET,
    'cms': CMS,
    'forum': FORUM,
    'projects': PROJECTS,
}

# ── Emission ────────────────────────────────────────────────────────────


def render_relation(name: str, kind: str, target: str, app: str) -> str:
    """Render a Django relation field."""
    # Resolve target reference: 'self', 'ModelInSameApp', 'otherapp.Model', 'auth.User'
    if target == 'self':
        ref = "'self'"
    elif '.' in target:
        ref = f"'{target}'"
    else:
        ref = target  # same-app reference, use direct class name if defined above
    if kind == 'FK':
        return f"{name} = models.ForeignKey({ref}, on_delete=models.CASCADE, related_name='+', null=True, blank=True)"
    if kind == 'O2O':
        return f"{name} = models.OneToOneField({ref}, on_delete=models.CASCADE, related_name='+', null=True, blank=True)"
    if kind == 'M2M':
        return f"{name} = models.ManyToManyField({ref}, related_name='+', blank=True)"
    raise ValueError(kind)


def render_model(app: str, name: str, spec: dict) -> str:
    fields = spec.get('fields', [])
    relations = spec.get('relations', [])
    meta = spec.get('meta', {})
    properties = spec.get('properties', [])

    lines = [f"class {name}(models.Model):"]
    lines.append(f'    """Auto-generated {app}.{name} for diagram stress testing."""')
    for fname, fshort in fields:
        lines.append(f"    {fname} = {FIELD_MAP[fshort]}")
    for rel in relations:
        lines.append(f"    {render_relation(*rel, app=app)}")

    if meta:
        lines.append("")
        lines.append("    class Meta:")
        if 'db_table' in meta:
            lines.append(f"        db_table = '{meta['db_table']}'")
        if 'ordering' in meta:
            lines.append(f"        ordering = {meta['ordering']!r}")
        if 'verbose_name' in meta:
            lines.append(f"        verbose_name = '{meta['verbose_name']}'")

    for prop in properties:
        lines.append("")
        lines.append("    @property")
        lines.append(f"    def {prop}(self):")
        lines.append(f"        return bool(self.pk)  # placeholder")

    lines.append("")
    lines.append(f"    def __str__(self):")
    first_field = fields[0][0] if fields else 'pk'
    lines.append(f"        return str(self.{first_field})")
    return "\n".join(lines)


HEADER = '''"""Auto-generated models for app `{app}` — stress-testing the diagram tool.

Total models in this app: {count}.
Regenerate via `python scripts/generate_test_models.py`.
"""
from django.db import models
'''


# ── Migration emission ──────────────────────────────────────────────────
# Keep the shapes close to what Django's `makemigrations` produces so that
# the extension's migration-parser regexes match cleanly.

_MIGRATION_FIELD_MAP = {
    'C':   "models.CharField(max_length=200)",
    'T':   "models.TextField(blank=True)",
    'I':   "models.IntegerField(default=0)",
    'B':   "models.BooleanField(default=False)",
    'D':   "models.DateField(null=True, blank=True)",
    'DT':  "models.DateTimeField(auto_now_add=True)",
    'DTU': "models.DateTimeField(auto_now=True)",
    'F':   "models.FloatField(default=0.0)",
    'DE':  "models.DecimalField(decimal_places=2, default=0, max_digits=12)",
    'S':   "models.SlugField(max_length=220, unique=True)",
    'E':   "models.EmailField(max_length=254)",
    'U':   "models.URLField(blank=True)",
    'J':   "models.JSONField(blank=True, default=dict)",
    'UUID':"models.UUIDField(default=uuid.uuid4, editable=False)",
}


def _render_migration_field(fname: str, fshort: str) -> str:
    return f"                ('{fname}', {_MIGRATION_FIELD_MAP[fshort]})"


def _render_migration_relation(rname: str, kind: str, target: str, app: str) -> str:
    if target == 'self':
        to = f"'{app}.{{model}}'"  # placeholder; filled by caller
    elif '.' in target:
        to = f"'{target.lower()}'"
    else:
        to = f"'{app}.{target.lower()}'"
    if kind == 'FK':
        return f"                ('{rname}', models.ForeignKey(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to={to}))"
    if kind == 'O2O':
        return f"                ('{rname}', models.OneToOneField(blank=True, null=True, on_delete=models.deletion.CASCADE, related_name='+', to={to}))"
    if kind == 'M2M':
        return f"                ('{rname}', models.ManyToManyField(blank=True, related_name='+', to={to}))"
    raise ValueError(kind)


def render_initial_migration(app: str, models_spec: dict) -> str:
    """Emit a 0001_initial.py with CreateModel operations for every model."""
    parts = [
        '"""Auto-generated initial migration for `{app}`."""'.format(app=app),
        'import uuid',
        'from django.db import migrations, models',
        'import django.db.models.deletion',
        '',
        '',
        'class Migration(migrations.Migration):',
        '    initial = True',
        '    dependencies = [',
        "        ('auth', '0012_alter_user_first_name_max_length'),",
        "        ('contenttypes', '0002_remove_content_type_name'),",
    ]
    # Cross-app dependencies: scan relations for 'otherapp.Model' targets.
    cross_apps = set()
    for spec in models_spec.values():
        for _, _, target in spec.get('relations', []):
            if '.' in target:
                other = target.split('.', 1)[0]
                if other not in ('auth', 'contenttypes', app):
                    cross_apps.add(other)
    for other in sorted(cross_apps):
        parts.append(f"        ('{other}', '0001_initial'),")
    parts.append('    ]')
    parts.append('')
    parts.append('    operations = [')

    for name, spec in models_spec.items():
        parts.append('        migrations.CreateModel(')
        parts.append(f"            name='{name}',")
        parts.append('            fields=[')
        parts.append("                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID'))" + ',')
        for fname, fshort in spec.get('fields', []):
            parts.append(_render_migration_field(fname, fshort) + ',')
        for rname, kind, target in spec.get('relations', []):
            # For self-referential, substitute the current model name
            line = _render_migration_relation(rname, kind, target, app)
            if target == 'self':
                line = line.replace('{model}', name.lower())
            parts.append(line + ',')
        parts.append('            ],')
        meta = spec.get('meta')
        if meta and 'db_table' in meta:
            parts.append('            options={')
            parts.append(f"                'db_table': '{meta['db_table']}',")
            if 'ordering' in meta:
                parts.append(f"                'ordering': {meta['ordering']!r},")
            parts.append('            },')
        parts.append('        ),')

    parts.append('    ]')
    parts.append('')
    return '\n'.join(parts)


# ── Evolution migrations ────────────────────────────────────────────────
# Hand-curated to exercise AddField / AlterField / RenameField / RemoveField /
# AddIndex / RenameModel / DeleteModel in the timeline.

EVOLUTION_MIGRATIONS = {
    'blog': {
        '0002_post_evolution': {
            'dependencies': [('blog', '0001_initial')],
            'operations': [
                "migrations.AddField(\n            model_name='post',\n            name='subtitle',\n            field=models.CharField(blank=True, max_length=300),\n        )",
                "migrations.AddField(\n            model_name='post',\n            name='word_count',\n            field=models.IntegerField(default=0),\n        )",
                "migrations.AlterField(\n            model_name='post',\n            name='title',\n            field=models.CharField(max_length=300),\n        )",
                "migrations.AddField(\n            model_name='comment',\n            name='is_pinned',\n            field=models.BooleanField(default=False),\n        )",
            ],
        },
        '0003_rename_and_cleanup': {
            'dependencies': [('blog', '0002_post_evolution')],
            'operations': [
                "migrations.RenameField(\n            model_name='post',\n            old_name='views',\n            new_name='view_count',\n        )",
                "migrations.RemoveField(\n            model_name='report',\n            name='is_resolved',\n        )",
                "migrations.AddIndex(\n            model_name='post',\n            index=models.Index(fields=['published_at'], name='blog_post_publish_idx'),\n        )",
            ],
        },
    },
    'crm': {
        '0002_crm_fields': {
            'dependencies': [('crm', '0001_initial')],
            'operations': [
                "migrations.AddField(\n            model_name='deal',\n            name='probability',\n            field=models.FloatField(default=0.5),\n        )",
                "migrations.AddField(\n            model_name='contact',\n            name='timezone',\n            field=models.CharField(blank=True, max_length=50),\n        )",
                "migrations.AlterField(\n            model_name='lead',\n            name='email',\n            field=models.EmailField(max_length=320),\n        )",
            ],
        },
        '0003_crm_renames': {
            'dependencies': [('crm', '0002_crm_fields')],
            'operations': [
                "migrations.RenameField(\n            model_name='lead',\n            old_name='score',\n            new_name='lead_score',\n        )",
                "migrations.RenameModel(\n            old_name='DealStage',\n            new_name='PipelineStage',\n        )",
                "migrations.RemoveField(\n            model_name='note',\n            name='account',\n        )",
            ],
        },
    },
    'billing': {
        '0002_billing_evolution': {
            'dependencies': [('billing', '0001_initial'), ('crm', '0003_crm_renames')],
            'operations': [
                "migrations.AddField(\n            model_name='invoice',\n            name='reference',\n            field=models.CharField(blank=True, max_length=100),\n        )",
                "migrations.AddField(\n            model_name='payment',\n            name='gateway_id',\n            field=models.CharField(blank=True, max_length=200),\n        )",
                "migrations.AlterField(\n            model_name='invoice',\n            name='total',\n            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),\n        )",
                "migrations.AddIndex(\n            model_name='invoice',\n            index=models.Index(fields=['issued_at'], name='billing_invoice_issued_idx'),\n        )",
            ],
        },
        '0003_billing_cleanup': {
            'dependencies': [('billing', '0002_billing_evolution')],
            'operations': [
                "migrations.RenameField(\n            model_name='payment',\n            old_name='paid_at',\n            new_name='processed_at',\n        )",
                "migrations.RemoveField(\n            model_name='coupon',\n            name='percent_off',\n        )",
                "migrations.AddField(\n            model_name='coupon',\n            name='amount_off',\n            field=models.DecimalField(decimal_places=2, default=0, max_digits=12),\n        )",
            ],
        },
    },
    'hr': {
        '0002_hr_fields': {
            'dependencies': [('hr', '0001_initial')],
            'operations': [
                "migrations.AddField(\n            model_name='employee',\n            name='phone',\n            field=models.CharField(blank=True, max_length=40),\n        )",
                "migrations.AddField(\n            model_name='employee',\n            name='birth_date',\n            field=models.DateField(blank=True, null=True),\n        )",
                "migrations.AlterField(\n            model_name='contract',\n            name='salary',\n            field=models.DecimalField(decimal_places=2, default=0, max_digits=14),\n        )",
                "migrations.RenameField(\n            model_name='leaverequest',\n            old_name='status',\n            new_name='approval_status',\n        )",
            ],
        },
    },
}


def render_evolution_migration(app: str, name: str, spec: dict) -> str:
    parts = [
        f'"""Evolution migration {name} for `{app}`."""',
        'from django.db import migrations, models',
        '',
        '',
        'class Migration(migrations.Migration):',
        '    dependencies = [',
    ]
    for dep_app, dep_name in spec['dependencies']:
        parts.append(f"        ('{dep_app}', '{dep_name}'),")
    parts.append('    ]')
    parts.append('')
    parts.append('    operations = [')
    for op in spec['operations']:
        parts.append('        ' + op + ',')
    parts.append('    ]')
    parts.append('')
    return '\n'.join(parts)


def write_app(app_name: str, models_spec: dict):
    app_dir = APPS_DIR / app_name
    migrations_dir = app_dir / 'migrations'
    app_dir.mkdir(parents=True, exist_ok=True)
    migrations_dir.mkdir(parents=True, exist_ok=True)

    (app_dir / '__init__.py').write_text('')
    (migrations_dir / '__init__.py').write_text('')

    # apps.py
    cls = ''.join(part.capitalize() for part in app_name.split('_'))
    (app_dir / 'apps.py').write_text(textwrap.dedent(f'''
        from django.apps import AppConfig


        class {cls}Config(AppConfig):
            default_auto_field = "django.db.models.BigAutoField"
            name = "apps.{app_name}"
    ''').lstrip())

    # models.py
    parts = [HEADER.format(app=app_name, count=len(models_spec))]
    for name, spec in models_spec.items():
        parts.append(render_model(app_name, name, spec))
        parts.append("")
    (app_dir / 'models.py').write_text("\n".join(parts))

    # Full 0001_initial.py with CreateModel operations for every model.
    (migrations_dir / '0001_initial.py').write_text(render_initial_migration(app_name, models_spec))

    # Evolution migrations (if any defined for this app).
    for mig_name, mig_spec in EVOLUTION_MIGRATIONS.get(app_name, {}).items():
        (migrations_dir / f'{mig_name}.py').write_text(render_evolution_migration(app_name, mig_name, mig_spec))


def patch_settings():
    text = SETTINGS.read_text()
    desired = [f"    'apps.{a}'," for a in ALL_APPS.keys()]
    # Replace the block between 'INSTALLED_APPS = [' and the matching ']'
    pattern = re.compile(r"INSTALLED_APPS\s*=\s*\[(.*?)\]", re.DOTALL)
    m = pattern.search(text)
    if not m:
        raise RuntimeError("Could not find INSTALLED_APPS in settings.py")
    current_block = m.group(1)
    # Keep existing apps (before our generated ones)
    keep_lines = []
    for line in current_block.splitlines():
        stripped = line.strip().rstrip(',').strip("'\"")
        if not stripped:
            continue
        if stripped.startswith(tuple(f"apps.{a}" for a in ALL_APPS.keys())):
            continue  # will be re-added
        keep_lines.append(line.rstrip(',').rstrip())
    new_block_lines = []
    for l in keep_lines:
        if l.strip():
            new_block_lines.append(l.rstrip(',') + ',')
    for l in desired:
        new_block_lines.append(l)
    new_block = "\n" + "\n".join(new_block_lines) + "\n"
    new_text = text[: m.start(1)] + new_block + text[m.end(1):]
    SETTINGS.write_text(new_text)


def main():
    for app_name, spec in ALL_APPS.items():
        write_app(app_name, spec)
        print(f"  wrote apps/{app_name}/ ({len(spec)} models)")
    patch_settings()
    total = sum(len(s) for s in ALL_APPS.values())
    print(f"\nDone. {total} models across {len(ALL_APPS)} new apps.")


if __name__ == '__main__':
    main()
