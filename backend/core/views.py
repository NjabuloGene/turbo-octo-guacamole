from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.contrib.auth import authenticate
from django.contrib.auth.models import User

@api_view(['POST'])
def login(request):
    """
    Login API view.
    Expects JSON: { "email": "user@example.com", "password": "..." }
    """
    email = request.data.get('email')
    password = request.data.get('password')

    if not email or not password:
        return Response({"error": "Email and password are required"}, status=400)

    # login by email
    try:
        user_obj = User.objects.get(email=email)
        user = authenticate(username=user_obj.username, password=password)
    except User.DoesNotExist:
        user = None

    if user is None:
        return Response({"error": "Invalid credentials"}, status=400)

    return Response({"message": "Login successful"})