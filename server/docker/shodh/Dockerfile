# Shodh Memory Server
# Thin wrapper around the official image to handle volume permission migration
FROM varunshodh/shodh-memory:latest

USER root
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["shodh-memory"]
