package cl.dramapp.backend.point.mp;

/** A print action: {@code created}, {@code on_terminal}, {@code processed}, {@code expired}, {@code canceled}... */
public record MpPrint(String id, String status) {
}
