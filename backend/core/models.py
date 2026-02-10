DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'helper_login',
        'USER': 'postgres',
        'PASSWORD': '5432',
        'HOST': 'localhost',
        'PORT': '5432',
    },
    'second_db': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': 'helper_app_data', # Your other database name
        'USER': 'postgres',
        'PASSWORD': 'YOUR_PASSWORD',
        'HOST': 'localhost',
        'PORT': '5432',
    }
}
