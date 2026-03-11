"""
Debug logging utility for MathMind Python server.
Provides consistent, detailed logging for all server operations.
"""

import logging
import sys
from datetime import datetime
from functools import wraps

# Configure root logger
logging.basicConfig(
    level=logging.DEBUG,
    format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    stream=sys.stdout
)

def get_logger(name):
    """Get a logger instance with the given name."""
    return logging.getLogger(name)

def log_function_call(logger_name=None):
    """Decorator to log function calls with arguments and execution time."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            logger = get_logger(logger_name or func.__module__)
            func_name = f"{func.__module__}.{func.__qualname__}"
            
            # Log function entry with args (truncated if too long)
            args_str = ', '.join([
                repr(a)[:100] + '...' if len(repr(a)) > 100 else repr(a)
                for a in args
            ])
            kwargs_str = ', '.join([
                f'{k}={repr(v)[:100]}...' if len(repr(v)) > 100 else f'{k}={repr(v)}'
                for k, v in kwargs.items()
            ])
            all_args = ', '.join(filter(None, [args_str, kwargs_str]))
            logger.debug(f"▶️  ENTER {func_name}({all_args})")
            
            start_time = datetime.now()
            try:
                result = func(*args, **kwargs)
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                
                # Log result (truncated if too long)
                result_str = repr(result)
                if len(result_str) > 200:
                    result_str = result_str[:200] + '...'
                logger.debug(f"✅ EXIT {func_name} → {result_str} ({elapsed:.2f}ms)")
                
                return result
            except Exception as e:
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                logger.exception(f"❌ ERROR {func_name}: {e} ({elapsed:.2f}ms)")
                raise
        return wrapper
    return decorator

def log_request():
    """Decorator to log HTTP request details for Flask routes."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            from flask import request
            logger = get_logger('http')
            
            # Log request details
            logger.info(f"📥 {request.method} {request.path}")
            logger.debug(f"   Headers: {dict(request.headers)}")
            
            if request.is_json:
                try:
                    json_data = request.get_json(silent=True)
                    json_str = str(json_data)
                    if len(json_str) > 500:
                        json_str = json_str[:500] + '...'
                    logger.debug(f"   JSON: {json_str}")
                except:
                    pass
            
            start_time = datetime.now()
            try:
                response = func(*args, **kwargs)
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                
                # Log response
                if hasattr(response, 'status_code'):
                    logger.info(f"📤 {response.status_code} ({elapsed:.2f}ms)")
                else:
                    logger.info(f"📤 OK ({elapsed:.2f}ms)")
                
                return response
            except Exception as e:
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                logger.exception(f"❌ HTTP ERROR: {e} ({elapsed:.2f}ms)")
                raise
        return wrapper
    return decorator

# Export all logging utilities
__all__ = ['get_logger', 'log_function_call', 'log_request']
