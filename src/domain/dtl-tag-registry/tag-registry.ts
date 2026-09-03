import { liveTokens } from '$domain/parsers/_shared/dtl-lexer';
/**
 * DTL tag and filter registry.
 *
 * Provides built-in Django template tag/filter names, documentation,
 * and library loading information. Pure TypeScript — no vscode dependency.
 *
 * Optional `customTags` parameter allows adapters to inject
 * dynamically-discovered tags from the Scanner.
 */

// ── Documentation types ──

const DJANGO_DOCS = 'https://docs.djangoproject.com/en/6.0/ref/templates/builtins';

export interface DtlDoc {
  readonly name: string;
  readonly type: 'tag' | 'filter';
  readonly syntax: string;
  readonly description: string;
  readonly example: string;
  readonly url: string;
}

export interface TagLibrary {
  readonly tags: string[];
  readonly filters: string[];
}

// ── Built-in: always available without {% load %} ──

export const BUILTIN_TAGS = new Set([
  'autoescape',
  'endautoescape',
  'block',
  'endblock',
  'comment',
  'endcomment',
  'csrf_token',
  'cycle',
  'debug',
  'extends',
  'filter',
  'endfilter',
  'firstof',
  'for',
  'endfor',
  'empty',
  'if',
  'elif',
  'else',
  'endif',
  'ifchanged',
  'endifchanged',
  'include',
  'load',
  'lorem',
  'now',
  'querystring',
  'regroup',
  'endregroup',
  'resetcycle',
  'spaceless',
  'endspaceless',
  'templatetag',
  'url',
  'verbatim',
  'endverbatim',
  'widthratio',
  'with',
  'endwith',
  'partial',
  'partialdef',
  'endpartialdef',
]);

export const BUILTIN_FILTERS = new Set([
  'add',
  'addslashes',
  'capfirst',
  'center',
  'cut',
  'date',
  'default',
  'default_if_none',
  'dictsort',
  'dictsortreversed',
  'divisibleby',
  'escape',
  'escapejs',
  'escapeseq',
  'filesizeformat',
  'first',
  'floatformat',
  'force_escape',
  'get_digit',
  'iriencode',
  'join',
  'json_script',
  'last',
  'length',
  'linebreaks',
  'linebreaksbr',
  'linenumbers',
  'ljust',
  'lower',
  'make_list',
  'phone2numeric',
  'pluralize',
  'pprint',
  'random',
  'rjust',
  'safe',
  'safeseq',
  'slice',
  'slugify',
  'stringformat',
  'striptags',
  'time',
  'timesince',
  'timeuntil',
  'title',
  'truncatechars',
  'truncatechars_html',
  'truncatewords',
  'truncatewords_html',
  'unordered_list',
  'upper',
  'urlencode',
  'urlize',
  'urlizetrunc',
  'wordcount',
  'wordwrap',
  'yesno',
]);

// ── Django libraries (require {% load libname %}) ──

export const DJANGO_LIBRARIES: Record<string, TagLibrary> = {
  i18n: {
    tags: [
      'trans',
      'translate',
      'blocktrans',
      'endblocktrans',
      'blocktranslate',
      'endblocktranslate',
      'language',
      'endlanguage',
      'get_available_languages',
      'get_current_language',
      'get_current_language_bidi',
      'get_language_info',
      'get_language_info_list',
    ],
    filters: ['language_name', 'language_name_local', 'language_name_translated', 'language_bidi'],
  },
  static: {
    tags: ['static', 'get_static_prefix', 'get_media_prefix'],
    filters: [],
  },
  l10n: {
    tags: ['localize', 'endlocalize'],
    filters: ['localize', 'unlocalize'],
  },
  tz: {
    tags: ['localtime', 'endlocaltime', 'timezone', 'endtimezone', 'get_current_timezone'],
    filters: ['localtime', 'utc', 'timezone'],
  },
  cache: {
    tags: ['cache', 'endcache'],
    filters: [],
  },
  humanize: {
    tags: [],
    filters: ['apnumber', 'intcomma', 'intword', 'naturalday', 'naturaltime', 'ordinal'],
  },
};

// ── Inline documentation for hover/completion ──

export const TAG_DOCS: Record<string, DtlDoc> = {
  if: {
    name: 'if',
    type: 'tag',
    syntax: '{% if condition %}...{% elif %}...{% else %}...{% endif %}',
    description: 'Evaluates a variable and outputs the block content if it is truthy.',
    example: '{% if user.is_authenticated %}\n  Welcome, {{ user.username }}!\n{% endif %}',
    url: `${DJANGO_DOCS}/#if`,
  },
  elif: {
    name: 'elif',
    type: 'tag',
    syntax: '{% elif condition %}',
    description: 'Additional condition branch inside an {% if %} block.',
    example: '{% if score > 90 %}\n  A\n{% elif score > 80 %}\n  B\n{% endif %}',
    url: `${DJANGO_DOCS}/#if`,
  },
  else: {
    name: 'else',
    type: 'tag',
    syntax: '{% else %}',
    description: 'Fallback branch inside an {% if %} or {% for %} block.',
    example: '{% if items %}\n  {{ items.count }} found\n{% else %}\n  No items\n{% endif %}',
    url: `${DJANGO_DOCS}/#if`,
  },
  for: {
    name: 'for',
    type: 'tag',
    syntax: '{% for item in iterable %}...{% empty %}...{% endfor %}',
    description:
      'Loops over each item in an iterable. Supports {% empty %} for when the list is empty.',
    example:
      '{% for product in products %}\n  <p>{{ product.name }}</p>\n{% empty %}\n  <p>No products found.</p>\n{% endfor %}',
    url: `${DJANGO_DOCS}/#for`,
  },
  empty: {
    name: 'empty',
    type: 'tag',
    syntax: '{% empty %}',
    description: 'Displayed when the {% for %} loop iterates over an empty list.',
    example: '{% for item in items %}\n  {{ item }}\n{% empty %}\n  Nothing here.\n{% endfor %}',
    url: `${DJANGO_DOCS}/#for-empty`,
  },
  block: {
    name: 'block',
    type: 'tag',
    syntax: '{% block name %}...{% endblock %}',
    description: 'Defines a block that child templates can override via template inheritance.',
    example: '{% block content %}\n  <h1>Default content</h1>\n{% endblock %}',
    url: `${DJANGO_DOCS}/#block`,
  },
  extends: {
    name: 'extends',
    type: 'tag',
    syntax: "{% extends 'parent.html' %}",
    description:
      'Declares that this template inherits from a parent template. Must be the first tag.',
    example: "{% extends 'base/base.html' %}\n{% block title %}My Page{% endblock %}",
    url: `${DJANGO_DOCS}/#extends`,
  },
  include: {
    name: 'include',
    type: 'tag',
    syntax: "{% include 'template.html' with key=value %}",
    description:
      'Renders another template with the current context. Use `with` to pass extra variables and `only` to isolate context.',
    example: "{% include 'partials/_card.html' with title=product.name only %}",
    url: `${DJANGO_DOCS}/#include`,
  },
  with: {
    name: 'with',
    type: 'tag',
    syntax: '{% with var=value %}...{% endwith %}',
    description: 'Caches a complex variable under a simpler name within the block.',
    example:
      '{% with total=order.items.count %}\n  {{ total }} item{{ total|pluralize }}\n{% endwith %}',
    url: `${DJANGO_DOCS}/#with`,
  },
  url: {
    name: 'url',
    type: 'tag',
    syntax: "{% url 'view_name' arg1 arg2 %}",
    description: 'Returns a URL matching a given view name and optional parameters.',
    example: "{% url 'product_detail' product.slug %}",
    url: `${DJANGO_DOCS}/#url`,
  },
  static: {
    name: 'static',
    type: 'tag',
    syntax: "{% static 'path/to/file' %}",
    description: 'Returns the URL of a static file. Requires {% load static %}.',
    example: '<img src="{% static \'img/logo.png\' %}">',
    url: 'https://docs.djangoproject.com/en/6.0/ref/templates/builtins/#static',
  },
  load: {
    name: 'load',
    type: 'tag',
    syntax: '{% load library1 library2 %}',
    description: 'Loads a template tag library, making its tags and filters available.',
    example: '{% load i18n static humanize %}',
    url: `${DJANGO_DOCS}/#load`,
  },
  csrf_token: {
    name: 'csrf_token',
    type: 'tag',
    syntax: '{% csrf_token %}',
    description:
      'Outputs a hidden input field for CSRF protection. Required inside <form method="post">.',
    example:
      '<form method="post">\n  {% csrf_token %}\n  <button type="submit">Submit</button>\n</form>',
    url: `${DJANGO_DOCS}/#csrf-token`,
  },
  comment: {
    name: 'comment',
    type: 'tag',
    syntax: '{% comment %}...{% endcomment %}',
    description: 'Ignores everything between the tags. Cannot be nested.',
    example: '{% comment %}\n  This code is disabled\n{% endcomment %}',
    url: `${DJANGO_DOCS}/#comment`,
  },
  trans: {
    name: 'trans',
    type: 'tag',
    syntax: "{% trans 'text' %}",
    description: 'Translates a string. Requires {% load i18n %}.',
    example: '<h1>{% trans "Welcome" %}</h1>',
    url: 'https://docs.djangoproject.com/en/6.0/topics/i18n/translation/#translate-template-tag',
  },
  blocktranslate: {
    name: 'blocktranslate',
    type: 'tag',
    syntax: '{% blocktranslate %}...{% endblocktranslate %}',
    description:
      'Translates a block of text with variable interpolation. Requires {% load i18n %}.',
    example:
      '{% blocktranslate with name=user.name %}\n  Hello, {{ name }}!\n{% endblocktranslate %}',
    url: 'https://docs.djangoproject.com/en/6.0/topics/i18n/translation/#blocktranslate-template-tag',
  },
  spaceless: {
    name: 'spaceless',
    type: 'tag',
    syntax: '{% spaceless %}...{% endspaceless %}',
    description: 'Removes whitespace between HTML tags.',
    example: '{% spaceless %}\n  <p>\n    <a href="/">Home</a>\n  </p>\n{% endspaceless %}',
    url: `${DJANGO_DOCS}/#spaceless`,
  },
  autoescape: {
    name: 'autoescape',
    type: 'tag',
    syntax: '{% autoescape on|off %}...{% endautoescape %}',
    description: 'Controls auto-escaping of HTML within the block.',
    example: '{% autoescape off %}\n  {{ html_content }}\n{% endautoescape %}',
    url: `${DJANGO_DOCS}/#autoescape`,
  },
  verbatim: {
    name: 'verbatim',
    type: 'tag',
    syntax: '{% verbatim %}...{% endverbatim %}',
    description:
      'Prevents the template engine from processing the block. Useful for JavaScript frameworks using {{ }}.',
    example: '{% verbatim %}\n  {{ angularVariable }}\n{% endverbatim %}',
    url: `${DJANGO_DOCS}/#verbatim`,
  },
  cycle: {
    name: 'cycle',
    type: 'tag',
    syntax: "{% cycle 'val1' 'val2' %}",
    description:
      'Produces one of its arguments each time it is encountered. Commonly used in loops for alternating CSS classes.',
    example: "{% for item in items %}\n  <tr class=\"{% cycle 'odd' 'even' %}\">\n{% endfor %}",
    url: `${DJANGO_DOCS}/#cycle`,
  },
  firstof: {
    name: 'firstof',
    type: 'tag',
    syntax: '{% firstof var1 var2 "fallback" %}',
    description: 'Outputs the first truthy variable from the argument list.',
    example: '{% firstof user.name user.email "Anonymous" %}',
    url: `${DJANGO_DOCS}/#firstof`,
  },
  now: {
    name: 'now',
    type: 'tag',
    syntax: '{% now "format" %}',
    description: 'Displays the current date/time using the given format string.',
    example: '{% now "Y-m-d H:i" %}',
    url: `${DJANGO_DOCS}/#now`,
  },
  regroup: {
    name: 'regroup',
    type: 'tag',
    syntax: '{% regroup list by attr as grouped %}',
    description: 'Regroups a list of objects by a common attribute.',
    example:
      '{% regroup products by category as grouped %}\n{% for group in grouped %}\n  <h3>{{ group.grouper }}</h3>\n{% endfor %}',
    url: `${DJANGO_DOCS}/#regroup`,
  },
  filter: {
    name: 'filter',
    type: 'tag',
    syntax: '{% filter force_escape|lower %}...{% endfilter %}',
    description: 'Applies filters to the content of the block.',
    example: '{% filter upper %}\n  this will be uppercase\n{% endfilter %}',
    url: `${DJANGO_DOCS}/#filter`,
  },
  widthratio: {
    name: 'widthratio',
    type: 'tag',
    syntax: '{% widthratio value max_value max_width %}',
    description: 'Calculates a ratio width, useful for bar charts.',
    example: '{% widthratio this_value max_value 100 %}',
    url: `${DJANGO_DOCS}/#widthratio`,
  },
  lorem: {
    name: 'lorem',
    type: 'tag',
    syntax: '{% lorem count method %}',
    description: 'Displays random "lorem ipsum" Latin text for placeholder content.',
    example: '{% lorem 2 p %}',
    url: `${DJANGO_DOCS}/#lorem`,
  },
  partial: {
    name: 'partial',
    type: 'tag',
    syntax: '{% partial name %}',
    description: 'Renders a previously defined partial template block. New in Django 6.0.',
    example: '{% partial sidebar %}',
    url: `${DJANGO_DOCS}/#partial`,
  },
  partialdef: {
    name: 'partialdef',
    type: 'tag',
    syntax: '{% partialdef name %}...{% endpartialdef %}',
    description: 'Defines a reusable partial template block. New in Django 6.0.',
    example: '{% partialdef sidebar %}\n  <nav>Sidebar content</nav>\n{% endpartialdef %}',
    url: `${DJANGO_DOCS}/#partialdef`,
  },
};

export const FILTER_DOCS: Record<string, DtlDoc> = {
  date: {
    name: 'date',
    type: 'filter',
    syntax: '{{ value|date:"format" }}',
    description: 'Formats a date according to the given format string.',
    example: '{{ created|date:"D d M Y" }} → Mon 01 Jan 2024',
    url: `${DJANGO_DOCS}/#date`,
  },
  default: {
    name: 'default',
    type: 'filter',
    syntax: '{{ value|default:"fallback" }}',
    description: 'If value evaluates to False, uses the given default.',
    example: '{{ name|default:"Anonymous" }}',
    url: `${DJANGO_DOCS}/#default`,
  },
  default_if_none: {
    name: 'default_if_none',
    type: 'filter',
    syntax: '{{ value|default_if_none:"fallback" }}',
    description:
      'If value is None, uses the given default. Unlike default, does not trigger on empty string.',
    example: '{{ bio|default_if_none:"No bio" }}',
    url: `${DJANGO_DOCS}/#default-if-none`,
  },
  safe: {
    name: 'safe',
    type: 'filter',
    syntax: '{{ value|safe }}',
    description: 'Marks a string as safe (not requiring HTML escaping).',
    example: '{{ html_content|safe }}',
    url: `${DJANGO_DOCS}/#safe`,
  },
  escape: {
    name: 'escape',
    type: 'filter',
    syntax: '{{ value|escape }}',
    description: 'Escapes HTML special characters.',
    example: '{{ user_input|escape }}',
    url: `${DJANGO_DOCS}/#escape`,
  },
  lower: {
    name: 'lower',
    type: 'filter',
    syntax: '{{ value|lower }}',
    description: 'Converts a string to all lowercase.',
    example: '{{ "Hello"|lower }} → hello',
    url: `${DJANGO_DOCS}/#lower`,
  },
  upper: {
    name: 'upper',
    type: 'filter',
    syntax: '{{ value|upper }}',
    description: 'Converts a string to all uppercase.',
    example: '{{ "Hello"|upper }} → HELLO',
    url: `${DJANGO_DOCS}/#upper`,
  },
  title: {
    name: 'title',
    type: 'filter',
    syntax: '{{ value|title }}',
    description: 'Converts a string to titlecase.',
    example: '{{ "hello world"|title }} → Hello World',
    url: `${DJANGO_DOCS}/#title`,
  },
  capfirst: {
    name: 'capfirst',
    type: 'filter',
    syntax: '{{ value|capfirst }}',
    description: 'Capitalizes the first character of the string.',
    example: '{{ "hello"|capfirst }} → Hello',
    url: `${DJANGO_DOCS}/#capfirst`,
  },
  truncatewords: {
    name: 'truncatewords',
    type: 'filter',
    syntax: '{{ value|truncatewords:N }}',
    description: 'Truncates a string after a certain number of words.',
    example: '{{ text|truncatewords:5 }}',
    url: `${DJANGO_DOCS}/#truncatewords`,
  },
  truncatechars: {
    name: 'truncatechars',
    type: 'filter',
    syntax: '{{ value|truncatechars:N }}',
    description: 'Truncates a string to at most N characters, appending "..." if truncated.',
    example: '{{ title|truncatechars:20 }}',
    url: `${DJANGO_DOCS}/#truncatechars`,
  },
  length: {
    name: 'length',
    type: 'filter',
    syntax: '{{ value|length }}',
    description: 'Returns the length of the value (works for strings, lists, etc.).',
    example: '{{ items|length }} → 5',
    url: `${DJANGO_DOCS}/#length`,
  },
  join: {
    name: 'join',
    type: 'filter',
    syntax: '{{ list|join:", " }}',
    description: 'Joins a list with a string separator.',
    example: '{{ tags|join:", " }} → python, django, web',
    url: `${DJANGO_DOCS}/#join`,
  },
  first: {
    name: 'first',
    type: 'filter',
    syntax: '{{ list|first }}',
    description: 'Returns the first item in a list.',
    example: '{{ items|first }}',
    url: `${DJANGO_DOCS}/#first`,
  },
  last: {
    name: 'last',
    type: 'filter',
    syntax: '{{ list|last }}',
    description: 'Returns the last item in a list.',
    example: '{{ items|last }}',
    url: `${DJANGO_DOCS}/#last`,
  },
  add: {
    name: 'add',
    type: 'filter',
    syntax: '{{ value|add:N }}',
    description: 'Adds the argument to the value. Works with integers, floats, strings, and lists.',
    example: '{{ price|add:10 }}',
    url: `${DJANGO_DOCS}/#add`,
  },
  floatformat: {
    name: 'floatformat',
    type: 'filter',
    syntax: '{{ value|floatformat:N }}',
    description: 'Rounds a float to N decimal places.',
    example: '{{ 3.14159|floatformat:2 }} → 3.14',
    url: `${DJANGO_DOCS}/#floatformat`,
  },
  pluralize: {
    name: 'pluralize',
    type: 'filter',
    syntax: '{{ count|pluralize }}',
    description: 'Returns "s" if the value is not 1. Supports custom suffixes.',
    example: '{{ count }} item{{ count|pluralize }}',
    url: `${DJANGO_DOCS}/#pluralize`,
  },
  slugify: {
    name: 'slugify',
    type: 'filter',
    syntax: '{{ value|slugify }}',
    description: 'Converts to ASCII, lowercases, and replaces spaces with hyphens.',
    example: '{{ "Hello World!"|slugify }} → hello-world',
    url: `${DJANGO_DOCS}/#slugify`,
  },
  yesno: {
    name: 'yesno',
    type: 'filter',
    syntax: '{{ value|yesno:"yes,no,maybe" }}',
    description: 'Maps True/False/None to custom strings.',
    example: '{{ active|yesno:"Active,Inactive" }}',
    url: `${DJANGO_DOCS}/#yesno`,
  },
  timesince: {
    name: 'timesince',
    type: 'filter',
    syntax: '{{ value|timesince }}',
    description: 'Formats a date as the time since that date (e.g. "4 days, 6 hours").',
    example: '{{ created|timesince }} ago',
    url: `${DJANGO_DOCS}/#timesince`,
  },
  timeuntil: {
    name: 'timeuntil',
    type: 'filter',
    syntax: '{{ value|timeuntil }}',
    description: 'Formats a date as the time until that date.',
    example: '{{ deadline|timeuntil }} remaining',
    url: `${DJANGO_DOCS}/#timeuntil`,
  },
  time: {
    name: 'time',
    type: 'filter',
    syntax: '{{ value|time:"H:i" }}',
    description: 'Formats a time value.',
    example: '{{ event_time|time:"H:i" }} → 14:30',
    url: `${DJANGO_DOCS}/#time`,
  },
  linebreaks: {
    name: 'linebreaks',
    type: 'filter',
    syntax: '{{ value|linebreaks }}',
    description: 'Converts newlines to <p> and <br> tags.',
    example: '{{ text|linebreaks }}',
    url: `${DJANGO_DOCS}/#linebreaks`,
  },
  linebreaksbr: {
    name: 'linebreaksbr',
    type: 'filter',
    syntax: '{{ value|linebreaksbr }}',
    description: 'Converts newlines to <br> tags.',
    example: '{{ text|linebreaksbr }}',
    url: `${DJANGO_DOCS}/#linebreaksbr`,
  },
  striptags: {
    name: 'striptags',
    type: 'filter',
    syntax: '{{ value|striptags }}',
    description: 'Strips all HTML tags.',
    example: '{{ html_content|striptags }}',
    url: `${DJANGO_DOCS}/#striptags`,
  },
  cut: {
    name: 'cut',
    type: 'filter',
    syntax: '{{ value|cut:" " }}',
    description: 'Removes all occurrences of the argument from the string.',
    example: '{{ phone|cut:"-" }}',
    url: `${DJANGO_DOCS}/#cut`,
  },
  urlencode: {
    name: 'urlencode',
    type: 'filter',
    syntax: '{{ value|urlencode }}',
    description: 'Escapes a string for use in a URL.',
    example: '{{ query|urlencode }}',
    url: `${DJANGO_DOCS}/#urlencode`,
  },
  urlize: {
    name: 'urlize',
    type: 'filter',
    syntax: '{{ value|urlize }}',
    description: 'Converts URLs and email addresses in text into clickable links.',
    example: '{{ comment|urlize }}',
    url: `${DJANGO_DOCS}/#urlize`,
  },
  wordcount: {
    name: 'wordcount',
    type: 'filter',
    syntax: '{{ value|wordcount }}',
    description: 'Returns the number of words in the string.',
    example: '{{ text|wordcount }}',
    url: `${DJANGO_DOCS}/#wordcount`,
  },
  filesizeformat: {
    name: 'filesizeformat',
    type: 'filter',
    syntax: '{{ value|filesizeformat }}',
    description: 'Formats a file size (e.g. 1024 → "1.0 KB").',
    example: '{{ file.size|filesizeformat }}',
    url: `${DJANGO_DOCS}/#filesizeformat`,
  },
  json_script: {
    name: 'json_script',
    type: 'filter',
    syntax: '{{ value|json_script:"id" }}',
    description:
      'Outputs a Python object as JSON wrapped in a <script> tag, safe for use in templates.',
    example: '{{ data|json_script:"my-data" }}',
    url: `${DJANGO_DOCS}/#json-script`,
  },
  dictsort: {
    name: 'dictsort',
    type: 'filter',
    syntax: '{{ list|dictsort:"key" }}',
    description: 'Sorts a list of dictionaries by the given key.',
    example: '{{ users|dictsort:"name" }}',
    url: `${DJANGO_DOCS}/#dictsort`,
  },
  slice: {
    name: 'slice',
    type: 'filter',
    syntax: '{{ list|slice:":5" }}',
    description: 'Returns a slice of the list (same as Python slicing).',
    example: '{{ items|slice:":3" }}',
    url: `${DJANGO_DOCS}/#slice`,
  },
  random: {
    name: 'random',
    type: 'filter',
    syntax: '{{ list|random }}',
    description: 'Returns a random item from the list.',
    example: '{{ tips|random }}',
    url: `${DJANGO_DOCS}/#random`,
  },
  divisibleby: {
    name: 'divisibleby',
    type: 'filter',
    syntax: '{{ value|divisibleby:"3" }}',
    description: 'Returns True if the value is divisible by the argument.',
    example: '{% if forloop.counter|divisibleby:"2" %}even{% endif %}',
    url: `${DJANGO_DOCS}/#divisibleby`,
  },
  center: {
    name: 'center',
    type: 'filter',
    syntax: '{{ value|center:"15" }}',
    description: 'Centers the string in a field of the given width.',
    example: '{{ name|center:"20" }}',
    url: `${DJANGO_DOCS}/#center`,
  },
  force_escape: {
    name: 'force_escape',
    type: 'filter',
    syntax: '{{ value|force_escape }}',
    description: 'Forces HTML escaping even if autoescape is off.',
    example: '{{ content|force_escape }}',
    url: `${DJANGO_DOCS}/#force-escape`,
  },
  escapejs: {
    name: 'escapejs',
    type: 'filter',
    syntax: '{{ value|escapejs }}',
    description: 'Escapes characters for use in JavaScript strings.',
    example: 'var name = "{{ name|escapejs }}";',
    url: `${DJANGO_DOCS}/#escapejs`,
  },
  intcomma: {
    name: 'intcomma',
    type: 'filter',
    syntax: '{{ value|intcomma }}',
    description: 'Converts an integer to a string with commas. Requires {% load humanize %}.',
    example: '{{ 1000000|intcomma }} → 1,000,000',
    url: 'https://docs.djangoproject.com/en/6.0/ref/contrib/humanize/#intcomma',
  },
  naturaltime: {
    name: 'naturaltime',
    type: 'filter',
    syntax: '{{ value|naturaltime }}',
    description:
      'Human-readable time difference (e.g. "2 hours ago"). Requires {% load humanize %}.',
    example: '{{ created|naturaltime }} → 2 hours ago',
    url: 'https://docs.djangoproject.com/en/6.0/ref/contrib/humanize/#naturaltime',
  },
  ordinal: {
    name: 'ordinal',
    type: 'filter',
    syntax: '{{ value|ordinal }}',
    description:
      'Converts an integer to its ordinal string (1st, 2nd, 3rd). Requires {% load humanize %}.',
    example: '{{ 3|ordinal }} → 3rd',
    url: 'https://docs.djangoproject.com/en/6.0/ref/contrib/humanize/#ordinal',
  },
};

// ── Lookup API ──

/**
 * Get the doc entry for a built-in DTL tag by name.
 */
export function getTagDoc(name: string): DtlDoc | undefined {
  return Object.hasOwn(TAG_DOCS, name) ? TAG_DOCS[name] : undefined;
}

/**
 * Get the doc entry for a built-in DTL filter by name.
 */
export function getFilterDoc(name: string): DtlDoc | undefined {
  return Object.hasOwn(FILTER_DOCS, name) ? FILTER_DOCS[name] : undefined;
}

/**
 * Get all available tags and filters, merging builtins with loaded and custom libraries.
 *
 * @param loadedLibs - Library names from `{% load libname %}` in the template.
 * @param customLibraries - Dynamically-discovered custom tag libraries from the Scanner.
 */
export function getAvailableTagsAndFilters(
  loadedLibs: string[],
  customLibraries: Map<string, TagLibrary>,
): { tags: Set<string>; filters: Set<string> } {
  const tags = new Set(BUILTIN_TAGS);
  const filters = new Set(BUILTIN_FILTERS);

  for (const lib of loadedLibs) {
    // `lib` is whatever the template wrote after `{% load %}`. A plain index
    // read answers `__proto__` and `constructor` with something truthy that
    // has no `.tags`, and iterating that threw — inside a catch, so
    // `{% load %}` diagnostics went silent for the whole file.
    const djangoLib = Object.hasOwn(DJANGO_LIBRARIES, lib) ? DJANGO_LIBRARIES[lib] : undefined;
    if (djangoLib) {
      for (const t of djangoLib.tags) tags.add(t);
      for (const f of djangoLib.filters) filters.add(f);
    }

    const customLib = customLibraries.get(lib);
    if (customLib) {
      for (const t of customLib.tags) tags.add(t);
      for (const f of customLib.filters) filters.add(f);
    }
  }

  return { tags, filters };
}

/**
 * Find which library provides a given tag (null = built-in, no load needed).
 */
export function findLibraryForTag(
  tagName: string,
  customLibraries: Map<string, TagLibrary>,
): string | null {
  if (BUILTIN_TAGS.has(tagName)) return null;

  for (const [libName, lib] of Object.entries(DJANGO_LIBRARIES)) {
    if (lib.tags.includes(tagName)) return libName;
  }

  for (const [libName, lib] of customLibraries) {
    if (lib.tags.includes(tagName)) return libName;
  }

  return null;
}

/**
 * Find which library provides a given filter (null = built-in, no load needed).
 */
export function findLibraryForFilter(
  filterName: string,
  customLibraries: Map<string, TagLibrary>,
): string | null {
  if (BUILTIN_FILTERS.has(filterName)) return null;

  for (const [libName, lib] of Object.entries(DJANGO_LIBRARIES)) {
    if (lib.filters.includes(filterName)) return libName;
  }

  for (const [libName, lib] of customLibraries) {
    if (lib.filters.includes(filterName)) return libName;
  }

  return null;
}

/**
 * EVERY library that declares `name`, Django libraries and custom ones alike.
 *
 * `findLibraryFor*` answers "which library should I tell the author to load",
 * which is a single best guess. That is the wrong question for deciding whether
 * a `{% load %}` is used: a name belongs to as many libraries as declare it,
 * and Django resolves it against the ones the template actually loaded — a
 * loaded library shadows a Django library and even a builtin. Asking the
 * single-answer function and comparing that one name to the loaded list
 * reported the shadowed-out load as dead.
 *
 * No builtin short-circuit on purpose: `{% load shop_tags %}{{ x|upper }}` with
 * `upper` declared in `shop_tags` runs shop_tags' filter, so the load is used.
 */
export function librariesProviding(
  name: string,
  kind: 'tag' | 'filter',
  customLibraries: Map<string, TagLibrary>,
): string[] {
  const found: string[] = [];
  const declares = (lib: TagLibrary): boolean =>
    kind === 'tag' ? lib.tags.includes(name) : lib.filters.includes(name);

  for (const [libName, lib] of Object.entries(DJANGO_LIBRARIES)) {
    if (declares(lib)) found.push(libName);
  }
  for (const [libName, lib] of customLibraries) {
    if (declares(lib)) found.push(libName);
  }
  return found;
}

// ── Load extraction ──

/**
 * Library names from the `{% load … %}` tags a template actually runs.
 *
 * A load written inside `{% comment %}` counted, so a commented-out
 * `{% load humanize %}` silenced the missing-load warning for every
 * `|intcomma` below it. Django raises `Invalid filter` on that page; we said
 * nothing at all.
 */
export function extractLoadedLibraries(templateSource: string): string[] {
  const libs: string[] = [];
  for (const token of liveTokens(templateSource)) {
    if (token.kind !== 'tag' || token.name !== 'load') continue;
    // `{% load a b %}` and `{% load x from lib %}` — the last word is the
    // library in the `from` form, every word after `load` in the plain one.
    const words = token.inner.split(/\s+/).slice(1);
    const from = words.indexOf('from');
    for (const lib of from === -1 ? words : words.slice(from + 1)) {
      if (lib && !libs.includes(lib)) libs.push(lib);
    }
  }
  return libs;
}

// NOTE: the old `parseCustomLibrary` scanner (regex over templatetags sources)
// was removed — custom tag/filter discovery is owned by `$domain/parsers/helpers`
// (parseHelpers), which the scanner feeds into `project.helpers`. Keeping two
// divergent regex scanners for the same job was a drift hazard.
