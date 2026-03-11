"""
Debug logging for MathMind routes.
Import this in each route file to enable consistent logging.
"""

import logging
import sys
from datetime import datetime
from functools import wraps

# Configure root logger if not already configured
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=logging.DEBUG,
        format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S',
        stream=sys.stdout
    )

def get_logger(name):
    """Get a logger instance with the given name."""
    return logging.getLogger(f'routes.{name}')

def log_route_call(logger_name=None):
    """Decorator to log route function calls with arguments and execution time."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            from flask import request
            logger = get_logger(logger_name or func.__module__.split('.')[-1])
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
            logger.debug(f"▶️  ENTER {func.__name__}({all_args})")
            
            start_time = datetime.now()
            try:
                result = func(*args, **kwargs)
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                
                # Log result summary
                if hasattr(result, 'status_code'):
                    logger.debug(f"✅ EXIT {func.__name__} → {result.status_code} ({elapsed:.2f}ms)")
                else:
                    result_str = repr(result)
                    if len(result_str) > 100:
                        result_str = result_str[:100] + '...'
                    logger.debug(f"✅ EXIT {func.__name__} → {result_str} ({elapsed:.2f}ms)")
                
                return result
            except Exception as e:
                elapsed = (datetime.now() - start_time).total_seconds() * 1000
                logger.exception(f"❌ ERROR {func.__name__}: {e} ({elapsed:.2f}ms)")
                raise
        return wrapper
    return decorator

# Export logging utilities
__all__ = ['get_logger', 'log_route_call']
