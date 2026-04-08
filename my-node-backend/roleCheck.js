/**
 * Role-based access control middleware
 * Checks if authenticated user has required role
 */

const roleCheck = (allowedRoles) => {
  return (req, res, next) => {
    // Check if user exists (set by verifyToken middleware)
    if (!req.user) {
      return res.status(401).json({ 
        success: false,
        error: 'Not authenticated' 
      });
    }
    
    // Check if user has required role
    if (!allowedRoles.includes(req.user.user_role)) {
      return res.status(403).json({ 
        success: false,
        error: `Access denied. This feature is only available to ${allowedRoles.join(' or ')}.` 
      });
    }
    
    next();
  };
};

module.exports = roleCheck;