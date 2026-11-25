package cl.dramapp.backend.event;

/** Something that may forbid closing an event. */
public interface EventCloseGuard {

	/** Throws when the event must not be closed now. */
	void beforeClose(Event event);

}
