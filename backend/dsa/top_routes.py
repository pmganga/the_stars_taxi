# backend/dsa/top_routes.py

def find_max(counts):
    """Return the key with the largest value in counts.

    Plain linear scan - walk every entry once, remember the biggest
    value seen so far. counts.items() pairs each key with its value
    so both are available in the same loop (see Python's tutorial,
    "Looping Techniques").
    """
    max_key = None
    max_value = None

    for key, value in counts.items():
        if max_value is None or value > max_value:
            max_key = key
            max_value = value

    return max_key


def top_k_routes(counts, k=10):
    """Return the top k (zone_name, trip_count) pairs, highest first.

    counts : dict mapping zone_name -> trip_count. Built by the SQL
             query in app.py's /api/top-routes route - this function
             doesn't touch the database itself.
    k      : how many entries to return. app.py already validates
             this is between 1 and 50 before calling here.

    Each pass through the data is O(n). The loop runs k times, so
    total time is O(n*k). n is at most 265 (the number of taxi zones),
    so even at k=50 this is at most ~13,000 comparisons - effectively
    instant, despite not being the fastest theoretical approach
    (a real heap-based top-k would be O(n log k)).

    Time:  O(n * k)
    Space: O(n) for the working copy of counts, O(k) for the result list
    """
    remaining = dict(counts)  
    result = []

    for _ in range(k):
        if not remaining:
            break

        winner = find_max(remaining)
        result.append((winner, remaining[winner]))
        del remaining[winner]

    return result